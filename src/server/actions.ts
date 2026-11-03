"use server";

import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import type { AcompteExige, CategorieDepense, EtapePipeline, EtatMateriel, ModePaiement, Role, SourceProspect, TypeConge, TypePaiement } from "@prisma/client";
import { prisma } from "@/lib/db";
import { normaliserTelephone, telephoneValide } from "@/lib/format";
import { CATEGORIES_DEPENSE, ETATS_MATERIEL, MODES, ROLES, TYPES_CONGE, categorieDocument, estLettreDefinitive, typePourAcompte } from "@/lib/labels";
import {
  peutAnnulerDepense,
  peutCreerClient,
  peutEncaisser,
  peutGererEquipe,
  peutInventaire,
  chargeEtape,
  estProduction,
  peutModifierMontant,
  peutParametrer,
  peutReaffecter,
  peutSigner,
  peutValiderConges,
  voitCompta,
  voitDepenses,
  voitDirection,
  voitPartenaires,
  type SessionUser,
} from "@/server/permissions";
import { aLeDroit } from "@/server/acces";
import { fermerSession, ouvrirSession, requireUser } from "@/server/session";
import {
  cloturerEtape,
  creerDossier,
  enregistrerDepense,
  enregistrerPaiement,
  envoyerCodeSuivi,
  envoyerPiecesManquantes,
  flushSms,
  refuserDepotClient,
  reorienterDossier,
  scannerAlertes,
} from "@/server/engine";

export type EtatAction = { error: string; manques?: string[] } | null;

function rafraichir() {
  revalidatePath("/", "layout");
}

async function bloqueParAcompte(libelle: string, etape: { dossierId: string; acompte: AcompteExige }) {
  const type = typePourAcompte(etape.acompte);
  if (!type || !estLettreDefinitive(libelle)) return false;
  const paiement = await prisma.paiement.findFirst({ where: { dossierId: etape.dossierId, type }, select: { id: true } });
  return !paiement;
}

async function urlDuSite() {
  const entetes = await headers();
  const hote = entetes.get("x-forwarded-host") ?? entetes.get("host");
  if (!hote) return null;
  return `${entetes.get("x-forwarded-proto") ?? (hote.startsWith("localhost") ? "http" : "https")}://${hote}`;
}

async function interdirePartenaire(user: SessionUser) {
  if (user.role === "PARTENAIRE") return "Action réservée aux collaborateurs.";
  return null;
}

export async function login(_etat: EtatAction, formData: FormData): Promise<EtatAction> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const motDePasse = String(formData.get("motDePasse") ?? "");
  const user = await prisma.user.findUnique({ where: { email } });
  if (user?.verrouilleJusquau && user.verrouilleJusquau > new Date()) {
    return { error: "Compte verrouillé après plusieurs échecs. Réessayez dans 15 minutes." };
  }
  const bon = Boolean(user?.actif) && (await bcrypt.compare(motDePasse, user!.motDePasseHash));
  if (!user || !bon) {
    if (user?.actif) {
      const echecs = user.echecsConnexion + 1;
      await prisma.user.update({
        where: { id: user.id },
        data: echecs >= 5 ? { echecsConnexion: 0, verrouilleJusquau: new Date(Date.now() + 15 * 60 * 1000) } : { echecsConnexion: echecs },
      });
      if (echecs >= 5) return { error: "Compte verrouillé après plusieurs échecs. Réessayez dans 15 minutes." };
    }
    return { error: "Identifiants incorrects, ou compte désactivé." };
  }
  await prisma.user.update({ where: { id: user.id }, data: { echecsConnexion: 0, verrouilleJusquau: null } });
  await ouvrirSession(user.id, formData.get("souvenir") === "on");
  redirect(user.role === "PARTENAIRE" ? "/dossiers" : "/tableau-de-bord");
}

export async function logout() {
  await fermerSession();
  redirect("/login");
}

export async function creerProspect(_etat: EtatAction, formData: FormData): Promise<EtatAction> {
  const user = await requireUser();
  if (!(await aLeDroit(user, "prospects"))) return { error: "Vous ne pouvez pas saisir de prospect." };
  const prenom = String(formData.get("prenom") ?? "").trim();
  const nom = String(formData.get("nom") ?? "").trim();
  const telephone = normaliserTelephone(String(formData.get("telephone") ?? ""));
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const source = String(formData.get("source") ?? "") as SourceProspect;
  const partenaireId = String(formData.get("partenaireId") ?? "") || null;
  const notes = String(formData.get("notes") ?? "").trim();
  const relance = String(formData.get("relanceLe") ?? "");

  if (!prenom || !nom) return { error: "Le nom et le prénom sont obligatoires." };
  if (!telephoneValide(telephone)) return { error: "Le téléphone doit être au format international, par exemple +2250700000000." };

  const [prospectExistant, clientExistant, emailProspect, emailClient] = await Promise.all([
    prisma.prospect.findFirst({ where: { telephone, converti: false } }),
    prisma.client.findFirst({ where: { telephone } }),
    email ? prisma.prospect.findFirst({ where: { email, converti: false } }) : null,
    email ? prisma.client.findFirst({ where: { email } }) : null,
  ]);
  if (prospectExistant || clientExistant) {
    return { error: "Ce téléphone existe déjà. Ouvrez la fiche existante au lieu de créer un doublon." };
  }
  if (emailProspect || emailClient) {
    return { error: "Cet e-mail existe déjà." };
  }
  if (source === "PARTENAIRE" && !partenaireId) {
    return { error: "Indiquez le partenaire qui a apporté ce contact." };
  }

  await prisma.prospect.create({
    data: {
      prenom,
      nom,
      telephone,
      email: email || null,
      source,
      partenaireId: partenaireId || null,
      notes: notes || null,
      relanceLe: relance ? new Date(`${relance}T12:00:00.000Z`) : null,
      activiteLe: new Date(),
      creeParId: user.id,
    },
  });
  rafraichir();
  return null;
}

const ETAPES_DEPLACABLES = ["CONTACT", "RENDEZ_VOUS", "PROPOSITION", "CONTRAT", "PAIEMENT"] as const;

export async function deplacerProspect(formData: FormData) {
  const user = await requireUser();
  if (!(await aLeDroit(user, "prospects"))) return;
  const id = String(formData.get("prospectId") ?? "");
  const etape = String(formData.get("etape") ?? "") as EtapePipeline;
  if (!ETAPES_DEPLACABLES.includes(etape as (typeof ETAPES_DEPLACABLES)[number])) return;
  const prospect = await prisma.prospect.findUnique({ where: { id } });
  if (!prospect || prospect.converti) return;
  if (user.role === "COMMERCIAL" && prospect.creeParId !== user.id) return;
  await prisma.prospect.update({ where: { id }, data: { etape, activiteLe: new Date() } });
  rafraichir();
}

export async function recevoirProspectPublic(_etat: EtatAction, formData: FormData): Promise<EtatAction> {
  const prenom = String(formData.get("prenom") ?? "").trim();
  const nom = String(formData.get("nom") ?? "").trim();
  const telephone = normaliserTelephone(String(formData.get("telephone") ?? ""));
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const notes = String(formData.get("notes") ?? "").trim();
  if (!prenom || !nom) return { error: "Le nom et le prénom sont obligatoires." };
  if (!telephoneValide(telephone)) return { error: "Indiquez un téléphone international, par exemple +2250700000000." };
  const [prospectExistant, clientExistant] = await Promise.all([
    prisma.prospect.findFirst({ where: { telephone, converti: false } }),
    prisma.client.findFirst({ where: { telephone } }),
  ]);
  if (prospectExistant || clientExistant) return { error: "Ce numéro est déjà enregistré. L'agence vous recontactera." };
  if (email) {
    const doublon = await prisma.prospect.findFirst({ where: { email, converti: false } });
    if (doublon) return { error: "Cet e-mail est déjà enregistré." };
  }
  const responsable = await prisma.user.findFirst({
    where: { actif: true, role: { in: ["RESPONSABLE_COMMERCIALE", "CEO"] } },
    orderBy: { role: "desc" },
  });
  if (!responsable) return { error: "Le formulaire est momentanément indisponible." };
  await prisma.prospect.create({
    data: {
      prenom,
      nom,
      telephone,
      email: email || null,
      source: "FORMULAIRE",
      notes: notes || null,
      etape: "CONTACT",
      activiteLe: new Date(),
      creeParId: responsable.id,
    },
  });
  await prisma.notificationInterne.create({
    data: {
      userId: responsable.id,
      titre: "Nouveau prospect",
      message: `${prenom} ${nom} a écrit via le formulaire public.`,
      lien: "/prospects",
    },
  });
  return null;
}

export async function signerContrat(formData: FormData) {
  const user = await requireUser();
  if (!peutSigner(user.role)) return;
  const dossierId = String(formData.get("dossierId") ?? "");
  const dossier = await prisma.dossier.findUnique({ where: { id: dossierId }, select: { id: true, reference: true, contratSigneLe: true } });
  if (!dossier || dossier.contratSigneLe) return;
  await prisma.dossier.update({ where: { id: dossier.id }, data: { contratSigneLe: new Date(), contratSigneParId: user.id } });
  await prisma.audit.create({
    data: { userId: user.id, action: "SIGNATURE", entite: "Dossier", entiteId: dossier.id, detail: dossier.reference },
  });
  rafraichir();
}

export async function signalerManquante(formData: FormData) {
  const user = await requireUser();
  if (user.role === "PARTENAIRE" || user.role === "COMPTABLE" || user.role === "MOYENS_GENERAUX") return;
  const piece = await prisma.pieceDossier.findUnique({ where: { id: String(formData.get("pieceId") ?? "") } });
  if (!piece || piece.recue) return;
  await prisma.pieceDossier.update({ where: { id: piece.id }, data: { manquante: true, categorie: categorieDocument(piece.libelle) } });
  await prisma.dossier.update({ where: { id: piece.dossierId }, data: { attentePieces: true } });
  await prisma.audit.create({
    data: { userId: user.id, action: "PIECE_MANQUANTE", entite: "Dossier", entiteId: piece.dossierId, detail: piece.libelle },
  });
  await envoyerPiecesManquantes({ dossierId: piece.dossierId, actor: user, baseUrl: await urlDuSite() });
  rafraichir();
}

export async function creerClient(_etat: EtatAction, formData: FormData): Promise<EtatAction> {
  const user = await requireUser();
  if (!peutCreerClient(user.role)) return { error: "Vous ne pouvez pas créer de client." };
  const prenom = String(formData.get("prenom") ?? "").trim();
  const nom = String(formData.get("nom") ?? "").trim();
  const telephone = normaliserTelephone(String(formData.get("telephone") ?? ""));
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const procedureId = String(formData.get("procedureId") ?? "");
  if (!prenom || !nom) return { error: "Le nom et le prénom sont obligatoires." };
  if (!telephoneValide(telephone)) return { error: "Le téléphone doit être au format international, par exemple +2250700000000." };
  const existant = await prisma.client.findFirst({ where: { telephone } });
  if (existant) return { error: `Ce téléphone appartient déjà à ${existant.prenom} ${existant.nom}. Ouvrez sa fiche pour lui créer un dossier.` };
  const procedure = procedureId ? await prisma.procedure.findUnique({ where: { id: procedureId }, select: { destination: true } }) : null;

  const client = await prisma.client.create({
    data: {
      prenom,
      nom,
      telephone,
      email: email || null,
      paysVise: String(formData.get("paysVise") ?? "").trim() || procedure?.destination || null,
      partenaireId: String(formData.get("partenaireId") ?? "") || null,
      garantNom: String(formData.get("garantNom") ?? "").trim() || null,
      garantTelephone: normaliserTelephone(String(formData.get("garantTelephone") ?? "")) || null,
    },
  });
  await prisma.audit.create({ data: { userId: user.id, action: "CLIENT", entite: "Client", entiteId: client.id, detail: telephone } });
  if (!procedureId) redirect(`/clients/${client.id}`);
  const cree = await creerDossier({ clientId: client.id, procedureId, actor: user });
  if (!cree.ok) return { error: `Client créé, mais le dossier n'a pas pu s'ouvrir : ${cree.error}` };
  redirect(`/dossiers/${cree.dossierId}`);
}

export async function modifierClient(_etat: EtatAction, formData: FormData): Promise<EtatAction> {
  const user = await requireUser();
  if (user.role === "PARTENAIRE") return { error: "Action réservée aux collaborateurs." };
  const id = String(formData.get("clientId") ?? "");
  const prenom = String(formData.get("prenom") ?? "").trim();
  const nom = String(formData.get("nom") ?? "").trim();
  const telephone = normaliserTelephone(String(formData.get("telephone") ?? ""));
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!prenom || !nom) return { error: "Le nom et le prénom sont obligatoires." };
  if (!telephoneValide(telephone)) return { error: "Téléphone international invalide." };
  const doublon = await prisma.client.findFirst({ where: { telephone, NOT: { id } } });
  if (doublon) return { error: "Ce téléphone appartient déjà à un autre client." };
  await prisma.client.update({
    where: { id },
    data: {
      prenom,
      nom,
      telephone,
      email: email || null,
      paysVise: String(formData.get("paysVise") ?? "").trim() || null,
      partenaireId: String(formData.get("partenaireId") ?? "") || null,
      garantNom: String(formData.get("garantNom") ?? "").trim() || null,
      garantTelephone: normaliserTelephone(String(formData.get("garantTelephone") ?? "")) || null,
    },
  });
  rafraichir();
  return null;
}

export async function ouvrirDossier(_etat: EtatAction, formData: FormData): Promise<EtatAction> {
  const user = await requireUser();
  if (!peutCreerClient(user.role)) return { error: "Vous ne pouvez pas ouvrir de dossier." };
  const clientId = String(formData.get("clientId") ?? "");
  const procedureId = String(formData.get("procedureId") ?? "");
  const cree = await creerDossier({ clientId, procedureId, actor: user });
  if (!cree.ok) return { error: cree.error, manques: cree.manques };
  const procedure = await prisma.procedure.findUnique({ where: { id: procedureId }, select: { destination: true } });
  if (procedure) await prisma.client.updateMany({ where: { id: clientId, paysVise: null }, data: { paysVise: procedure.destination } });
  redirect(`/dossiers/${cree.dossierId}`);
}

export async function modifierProspect(_etat: EtatAction, formData: FormData): Promise<EtatAction> {
  const user = await requireUser();
  if (!(await aLeDroit(user, "prospects"))) return { error: "Modification non autorisée." };
  const relance = String(formData.get("relanceLe") ?? "");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  await prisma.prospect.update({
    where: { id: String(formData.get("prospectId") ?? "") },
    data: {
      email: email || null,
      notes: String(formData.get("notes") ?? "").trim() || null,
      relanceLe: relance ? new Date(`${relance}T12:00:00.000Z`) : null,
    },
  });
  rafraichir();
  return null;
}

export async function changerMotDePasse(_etat: EtatAction, formData: FormData): Promise<EtatAction> {
  const user = await requireUser();
  const actuel = String(formData.get("actuel") ?? "");
  const nouveau = String(formData.get("nouveau") ?? "");
  const confirmation = String(formData.get("confirmation") ?? "");
  const compte = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  if (!(await bcrypt.compare(actuel, compte.motDePasseHash))) return { error: "Le mot de passe actuel est incorrect." };
  if (nouveau.length < 8) return { error: "Le nouveau mot de passe contient au moins 8 caractères." };
  if (nouveau !== confirmation) return { error: "La confirmation ne correspond pas." };
  await prisma.user.update({ where: { id: user.id }, data: { motDePasseHash: await bcrypt.hash(nouveau, 10) } });
  return null;
}

export async function reinitialiserMotDePasse(_etat: EtatAction, formData: FormData): Promise<EtatAction> {
  const user = await requireUser();
  if (!peutGererEquipe(user.role)) return { error: "Réservé à la direction." };
  const motDePasse = String(formData.get("motDePasse") ?? "");
  if (motDePasse.length < 8) return { error: "Le mot de passe contient au moins 8 caractères." };
  await prisma.user.update({
    where: { id: String(formData.get("userId") ?? "") },
    data: { motDePasseHash: await bcrypt.hash(motDePasse, 10) },
  });
  return null;
}

export async function marquerNotificationsLues() {
  const user = await requireUser();
  await prisma.notificationInterne.updateMany({ where: { userId: user.id, lue: false }, data: { lue: true } });
  rafraichir();
}

export async function convertirProspect(_etat: EtatAction, formData: FormData): Promise<EtatAction> {
  const user = await requireUser();
  if (!(await aLeDroit(user, "prospects"))) return { error: "Conversion non autorisée." };
  const prospectId = String(formData.get("prospectId") ?? "");
  const procedureId = String(formData.get("procedureId") ?? "");
  const prospect = await prisma.prospect.findUnique({ where: { id: prospectId } });
  if (!prospect || prospect.converti) return { error: "Ce prospect est déjà converti." };
  if (!procedureId) return { error: "Choisissez une procédure." };

  const procedure = await prisma.procedure.findUnique({ where: { id: procedureId }, select: { destination: true } });
  let client = await prisma.client.findFirst({ where: { telephone: prospect.telephone } });
  if (!client) {
    client = await prisma.client.create({
      data: {
        prenom: prospect.prenom,
        nom: prospect.nom,
        telephone: prospect.telephone,
        email: prospect.email,
        partenaireId: prospect.partenaireId,
        paysVise: procedure?.destination ?? null,
      },
    });
  } else if (!client.paysVise && procedure) {
    client = await prisma.client.update({ where: { id: client.id }, data: { paysVise: procedure.destination } });
  }
  if (!client.convertiLe) {
    client = await prisma.client.update({
      where: { id: client.id },
      data: { convertiLe: new Date(), convertiParId: user.id },
    });
  }

  const cree = await creerDossier({ clientId: client.id, procedureId, actor: user });
  if (!cree.ok) return { error: cree.error, manques: cree.manques };

  await prisma.prospect.update({
    where: { id: prospect.id },
    data: { converti: true, clientId: client.id, etape: "CLIENT", activiteLe: new Date() },
  });
  await prisma.audit.create({
    data: {
      userId: user.id,
      action: "CONVERSION",
      entite: "Dossier",
      entiteId: cree.dossierId!,
      detail: prospect.telephone,
    },
  });
  redirect(`/dossiers/${cree.dossierId}`);
}

export async function basculerTache(formData: FormData) {
  const user = await requireUser();
  const refus = await interdirePartenaire(user);
  if (refus) return;
  const tache = await prisma.tacheDossier.findUnique({
    where: { id: String(formData.get("tacheId") ?? "") },
    include: { etape: true },
  });
  if (!tache || tache.etape.statut !== "EN_COURS") return;
  if (estProduction(user.role) && !chargeEtape(user.role, tache.etape.roles) && tache.etape.responsableId !== user.id) return;
  if (!tache.faite && (await bloqueParAcompte(tache.libelle, tache.etape))) {
    throw new Error("Encaissez d'abord l'acompte : la lettre d'admission définitive en dépend.");
  }
  const faite = !tache.faite;
  await prisma.tacheDossier.update({
    where: { id: tache.id },
    data: { faite, faiteLe: faite ? new Date() : null, faiteParId: faite ? user.id : null },
  });
  await prisma.audit.create({
    data: {
      userId: user.id,
      action: faite ? "TACHE_FAITE" : "TACHE_REPRISE",
      entite: "Dossier",
      entiteId: tache.etape.dossierId,
      detail: tache.libelle,
    },
  });
  rafraichir();
}

export async function deposerPiece(_etat: EtatAction, formData: FormData): Promise<EtatAction> {
  const user = await requireUser();
  const refus = await interdirePartenaire(user);
  if (refus) return { error: refus };
  const piece = await prisma.pieceDossier.findUnique({
    where: { id: String(formData.get("pieceId") ?? "") },
    include: { etape: true },
  });
  if (!piece) return { error: "Pièce introuvable." };
  if (piece.etape && (await bloqueParAcompte(piece.libelle, piece.etape))) {
    return { error: "Encaissez d'abord l'acompte : la lettre d'admission définitive en dépend." };
  }
  const fichier = formData.get("fichier");
  let fichierNom: string | null = piece.fichierNom;
  let fichierChemin: string | null = piece.fichierChemin;

  if (fichier instanceof File && fichier.size > 0) {
    if (fichier.size > 10 * 1024 * 1024) return { error: "Le fichier dépasse 10 Mo." };
    const dossier = path.join(process.cwd(), "storage", "pieces");
    await mkdir(dossier, { recursive: true });
    if (piece.fichierChemin) {
      await prisma.pieceVersion.create({
        data: {
          pieceId: piece.id,
          version: piece.version,
          fichierNom: piece.fichierNom || piece.libelle,
          fichierChemin: piece.fichierChemin,
          deposeParId: piece.recueParId,
          deposeLe: piece.recueLe ?? new Date(),
        },
      });
    }
    const nom = `${piece.id}-${Date.now()}-${fichier.name.replace(/[^\w.\-]+/g, "_")}`;
    await writeFile(path.join(dossier, nom), Buffer.from(await fichier.arrayBuffer()));
    fichierNom = fichier.name;
    fichierChemin = nom;
  }

  await prisma.pieceDossier.update({
    where: { id: piece.id },
    data: {
      recue: true,
      recueLe: new Date(),
      recueParId: user.id,
      fichierNom,
      fichierChemin,
      manquante: false,
      categorie: piece.categorie === "Dossier" ? categorieDocument(piece.libelle) : piece.categorie,
      version: piece.fichierChemin && fichier instanceof File && fichier.size > 0 ? piece.version + 1 : piece.version,
    },
  });
  await prisma.audit.create({
    data: {
      userId: user.id,
      action: "PIECE_RECUE",
      entite: "Dossier",
      entiteId: piece.dossierId,
      detail: piece.libelle,
    },
  });
  const reste = await prisma.pieceDossier.count({ where: { dossierId: piece.dossierId, recue: false, fichierChemin: null } });
  if (reste === 0) await prisma.dossier.update({ where: { id: piece.dossierId }, data: { attentePieces: false } });
  rafraichir();
  return null;
}

export async function retirerPiece(formData: FormData) {
  const user = await requireUser();
  if (user.role === "PARTENAIRE") return;
  const piece = await prisma.pieceDossier.findUnique({ where: { id: String(formData.get("pieceId") ?? "") } });
  if (!piece) return;
  if (!piece.recue && piece.fichierChemin) {
    const chemin = await refuserDepotClient({ pieceId: piece.id, actor: user });
    if (chemin) await unlink(path.join(process.cwd(), "storage", "pieces", path.basename(chemin))).catch(() => undefined);
    rafraichir();
    return;
  }
  await prisma.pieceDossier.update({
    where: { id: piece.id },
    data: { recue: false, recueLe: null, recueParId: null },
  });
  rafraichir();
}

export async function cloturer(_etat: EtatAction, formData: FormData): Promise<EtatAction> {
  const user = await requireUser();
  const resultat = await cloturerEtape({
    etapeId: String(formData.get("etapeId") ?? ""),
    issueId: String(formData.get("issueId") ?? "") || undefined,
    observation: String(formData.get("observation") ?? "").trim(),
    actor: user,
    baseUrl: await urlDuSite(),
  });
  if (!resultat.ok) return { error: resultat.error, manques: resultat.manques };
  rafraichir();
  return null;
}

export async function renvoyerCodeSuivi(_etat: EtatAction, formData: FormData): Promise<EtatAction> {
  const user = await requireUser();
  const refus = await interdirePartenaire(user);
  if (refus) return { error: refus };
  const resultat = await envoyerCodeSuivi({
    dossierId: String(formData.get("dossierId") ?? ""),
    actor: user,
    baseUrl: await urlDuSite(),
  });
  if (!resultat.ok) return { error: resultat.error };
  rafraichir();
  return null;
}

export async function reaffecter(_etat: EtatAction, formData: FormData): Promise<EtatAction> {
  const user = await requireUser();
  if (!peutReaffecter(user.role)) return { error: "Vous ne pouvez pas réaffecter un dossier." };
  const etape = await prisma.dossierEtape.findUnique({ where: { id: String(formData.get("etapeId") ?? "") } });
  const cible = await prisma.user.findUnique({ where: { id: String(formData.get("userId") ?? "") } });
  if (!etape || etape.statut !== "EN_COURS" || !cible?.actif) return { error: "Réaffectation impossible." };
  const delegation = !etape.roles.split(",").includes(cible.role);
  await prisma.dossierEtape.update({
    where: { id: etape.id },
    data: { responsableId: cible.id, delegation },
  });
  await prisma.notificationInterne.create({
    data: {
      userId: cible.id,
      titre: delegation ? "Délégation" : "Mission",
      message: `Dossier réaffecté : ${etape.titre}`,
      lien: `/dossiers/${etape.dossierId}`,
    },
  });
  const sms = await prisma.notificationSms.create({
    data: {
      telephone: cible.telephone,
      type: "COLLABORATEUR",
      dossierId: etape.dossierId,
      texte: `EDUDESK: dossier reaffecte, etape "${etape.titre}".`,
      segments: 1,
    },
  });
  await flushSms([sms.id]);
  await prisma.audit.create({
    data: {
      userId: user.id,
      action: "REAFFECTATION",
      entite: "Dossier",
      entiteId: etape.dossierId,
      detail: `${cible.prenom} ${cible.nom}`,
    },
  });
  rafraichir();
  return null;
}

export async function encaisser(_etat: EtatAction, formData: FormData): Promise<EtatAction> {
  const user = await requireUser();
  if (!peutEncaisser(user.role) && !(await aLeDroit(user, "caisse"))) return { error: "Vous ne pouvez pas enregistrer un encaissement." };
  const montant = Number(String(formData.get("montant") ?? "").replace(/\s/g, ""));
  const jour = String(formData.get("date") ?? "");
  const resultat = await enregistrerPaiement({
    dossierId: String(formData.get("dossierId") ?? ""),
    type: String(formData.get("type") ?? "") as TypePaiement,
    montant,
    mode: String(formData.get("mode") ?? "") as ModePaiement,
    precision: String(formData.get("precision") ?? "").trim(),
    referenceExterne: String(formData.get("referenceExterne") ?? "").trim(),
    dateEncaissement: jour ? new Date(`${jour}T12:00:00.000Z`) : new Date(),
    actor: user,
  });
  if (!resultat.ok) return { error: resultat.error };
  rafraichir();
  return null;
}

export async function rapprocher(formData: FormData) {
  const user = await requireUser();
  if (!voitCompta(user.role)) return;
  await prisma.paiement.update({
    where: { id: String(formData.get("paiementId") ?? "") },
    data: { statut: "RAPPROCHE" },
  });
  rafraichir();
}

export async function reorienter(_etat: EtatAction, formData: FormData): Promise<EtatAction> {
  const user = await requireUser();
  if (user.role === "PARTENAIRE") return { error: "Action non autorisée." };
  const resultat = await reorienterDossier({
    dossierId: String(formData.get("dossierId") ?? ""),
    procedureId: String(formData.get("procedureId") ?? ""),
    actor: user,
  });
  if (!resultat.ok) return { error: resultat.error };
  redirect(`/dossiers/${resultat.dossierId}`);
}

export async function modifierDelai(_etat: EtatAction, formData: FormData): Promise<EtatAction> {
  const user = await requireUser();
  if (!peutParametrer(user.role)) return { error: "Réservé à la direction et à l'administrateur." };
  const brut = String(formData.get("delaiHeures") ?? "").trim();
  const delaiHeures = brut === "" ? null : Number(brut);
  if (delaiHeures != null && (!Number.isInteger(delaiHeures) || delaiHeures < 0)) {
    return { error: "Le délai est un nombre d'heures, ou vide." };
  }
  const etape = await prisma.etapeModele.update({
    where: { id: String(formData.get("etapeId") ?? "") },
    data: { delaiHeures },
  });
  await prisma.procedure.update({ where: { id: etape.procedureId }, data: { version: { increment: 1 } } });
  rafraichir();
  return null;
}

export async function modifierLimite(_etat: EtatAction, formData: FormData): Promise<EtatAction> {
  const user = await requireUser();
  if (!peutReaffecter(user.role) && user.role !== "ASSISTANTE_ADMINISTRATIVE") {
    return { error: "Vous ne pouvez pas modifier cette échéance." };
  }
  const valeur = String(formData.get("limite") ?? "");
  const etape = await prisma.dossierEtape.findUnique({ where: { id: String(formData.get("etapeId") ?? "") } });
  if (!etape || etape.statut !== "EN_COURS") return { error: "Étape introuvable." };
  await prisma.dossierEtape.update({
    where: { id: etape.id },
    data: {
      limiteLe: valeur ? new Date(`${valeur}:00.000Z`) : null,
      alerteJ1: false,
      alerteRetard: false,
    },
  });
  await prisma.audit.create({
    data: { userId: user.id, action: "DELAI", entite: "Dossier", entiteId: etape.dossierId, detail: valeur || "sans délai" },
  });
  rafraichir();
  return null;
}

export async function ajouterEtape(_etat: EtatAction, formData: FormData): Promise<EtatAction> {
  const user = await requireUser();
  if (!peutParametrer(user.role)) return { error: "Réservé à la direction et à l'administrateur." };
  const procedureId = String(formData.get("procedureId") ?? "");
  const titre = String(formData.get("titre") ?? "").trim();
  const tache = String(formData.get("tache") ?? "").trim();
  const piece = String(formData.get("piece") ?? "").trim();
  const roles = formData.getAll("roles").map(String).filter((role) => ROLES.some((item) => item.value === role));
  const brutRang = Number(formData.get("rang") ?? "");
  const brutDelai = String(formData.get("delaiHeures") ?? "").trim();
  if (!titre || !tache || roles.length === 0) {
    return { error: "Titre, au moins un responsable et une tâche sont obligatoires." };
  }
  const delaiHeures = brutDelai === "" ? null : Number(brutDelai);
  if (delaiHeures != null && (!Number.isInteger(delaiHeures) || delaiHeures < 0)) {
    return { error: "Délai invalide." };
  }

  await prisma.$transaction(async (tx) => {
    const compte = await tx.etapeModele.count({ where: { procedureId } });
    const rang = Number.isInteger(brutRang) && brutRang >= 1 && brutRang <= compte + 1 ? brutRang : compte + 1;
    await tx.etapeModele.updateMany({
      where: { procedureId, rang: { gte: rang } },
      data: { rang: { increment: 1 } },
    });
    await tx.etapeModele.create({
      data: {
        procedureId,
        rang,
        titre,
        delaiHeures,
        roles: roles.join(","),
        taches: { create: [{ ordre: 1, libelle: tache, obligatoire: true }] },
        pieces: piece ? { create: [{ ordre: 1, libelle: piece, obligatoire: true }] } : undefined,
      },
    });
    await tx.procedure.update({
      where: { id: procedureId },
      data: { version: { increment: 1 } },
    });
  });
  rafraichir();
  return null;
}

export async function ajouterElementModele(formData: FormData) {
  const user = await requireUser();
  if (!peutParametrer(user.role)) return;
  const etapeId = String(formData.get("etapeId") ?? "");
  const sorte = String(formData.get("sorte") ?? "");
  const libelle = String(formData.get("libelle") ?? "").trim();
  if (!libelle) return;
  const etape = await prisma.etapeModele.findUnique({ where: { id: etapeId } });
  if (!etape) return;
  if (sorte === "tache") {
    const ordre = (await prisma.tacheModele.count({ where: { etapeModeleId: etapeId } })) + 1;
    await prisma.tacheModele.create({ data: { etapeModeleId: etapeId, ordre, libelle, obligatoire: true } });
  } else {
    const ordre = (await prisma.pieceModele.count({ where: { etapeModeleId: etapeId } })) + 1;
    await prisma.pieceModele.create({ data: { etapeModeleId: etapeId, ordre, libelle, obligatoire: true } });
  }
  await prisma.procedure.update({ where: { id: etape.procedureId }, data: { version: { increment: 1 } } });
  rafraichir();
}

export async function modifierCommission(_etat: EtatAction, formData: FormData): Promise<EtatAction> {
  const user = await requireUser();
  if (user.role !== "CEO" && user.role !== "ADMINISTRATEUR") return { error: "Réservé à la direction." };
  const montant = entier(formData.get("commissionXof"));
  const tarif = entier(formData.get("tarifXof"));
  if (montant == null || montant < 0 || tarif == null || tarif < 0) return { error: "Montant invalide." };
  await prisma.procedure.update({
    where: { id: String(formData.get("procedureId") ?? "") },
    data: { commissionXof: montant, tarifXof: tarif },
  });
  rafraichir();
  return null;
}

function entier(valeur: FormDataEntryValue | null) {
  const brut = String(valeur ?? "").replace(/\s/g, "");
  if (brut === "") return 0;
  const nombre = Number(brut);
  return Number.isInteger(nombre) ? nombre : null;
}

function jourSaisi(valeur: FormDataEntryValue | null) {
  const jour = String(valeur ?? "");
  return /^\d{4}-\d{2}-\d{2}$/.test(jour) ? new Date(`${jour}T12:00:00.000Z`) : null;
}

export async function modifierMontantConvenu(_etat: EtatAction, formData: FormData): Promise<EtatAction> {
  const user = await requireUser();
  if (!peutModifierMontant(user.role)) return { error: "Vous ne pouvez pas modifier le montant convenu." };
  const montant = entier(formData.get("montantConvenu"));
  if (montant == null || montant < 0) return { error: "Montant invalide." };
  const dossier = await prisma.dossier.update({
    where: { id: String(formData.get("dossierId") ?? "") },
    data: { montantConvenu: montant },
  });
  await prisma.audit.create({
    data: { userId: user.id, action: "MONTANT_CONVENU", entite: "Dossier", entiteId: dossier.id, detail: String(montant) },
  });
  rafraichir();
  return null;
}

export async function creerDepense(_etat: EtatAction, formData: FormData): Promise<EtatAction> {
  const user = await requireUser();
  if (!voitDepenses(user.role)) return { error: "Vous ne pouvez pas saisir de dépense." };
  const categorie = String(formData.get("categorie") ?? "") as CategorieDepense;
  const mode = String(formData.get("mode") ?? "") as ModePaiement;
  if (!CATEGORIES_DEPENSE.some((item) => item.value === categorie)) return { error: "Choisissez une catégorie." };
  if (!MODES.some((item) => item.value === mode)) return { error: "Choisissez le moyen de paiement." };
  const montant = entier(formData.get("montant"));
  const resultat = await enregistrerDepense({
    date: jourSaisi(formData.get("date")) ?? new Date(),
    categorie,
    libelle: String(formData.get("libelle") ?? "").trim(),
    montant: montant ?? 0,
    mode,
    fournisseur: String(formData.get("fournisseur") ?? "").trim(),
    reference: String(formData.get("reference") ?? "").trim(),
    partenaireId: String(formData.get("partenaireId") ?? "") || null,
    actor: user,
  });
  if (!resultat.ok) return { error: resultat.error };
  rafraichir();
  return null;
}

export async function annulerDepense(formData: FormData) {
  const user = await requireUser();
  if (!peutAnnulerDepense(user.role)) return;
  const depense = await prisma.depense.findUnique({ where: { id: String(formData.get("depenseId") ?? "") } });
  if (!depense) return;
  await prisma.$transaction([
    prisma.ecriture.deleteMany({ where: { depenseId: depense.id } }),
    prisma.depense.delete({ where: { id: depense.id } }),
    prisma.audit.create({
      data: { userId: user.id, action: "DEPENSE_ANNULEE", entite: "Depense", entiteId: depense.id, detail: `${depense.numero} ${depense.montant}` },
    }),
  ]);
  rafraichir();
}

export async function creerPartenaire(_etat: EtatAction, formData: FormData): Promise<EtatAction> {
  const user = await requireUser();
  if (!voitPartenaires(user.role)) return { error: "Réservé à la direction et au commercial." };
  const nom = String(formData.get("nom") ?? "").trim();
  const type = String(formData.get("type") ?? "").trim() || "Apporteur";
  const telephone = normaliserTelephone(String(formData.get("telephone") ?? ""));
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!nom) return { error: "Le nom du partenaire est obligatoire." };
  if (!telephoneValide(telephone)) return { error: "Téléphone international invalide." };
  await prisma.partenaire.create({ data: { nom, type, telephone, email: email || null } });
  rafraichir();
  return null;
}

export async function verserCommission(_etat: EtatAction, formData: FormData): Promise<EtatAction> {
  const user = await requireUser();
  if (!voitDepenses(user.role)) return { error: "Le versement passe par la comptabilité ou la direction." };
  const partenaire = await prisma.partenaire.findUnique({ where: { id: String(formData.get("partenaireId") ?? "") } });
  if (!partenaire) return { error: "Partenaire introuvable." };
  const mode = String(formData.get("mode") ?? "") as ModePaiement;
  if (!MODES.some((item) => item.value === mode)) return { error: "Choisissez le moyen de paiement." };
  const resultat = await enregistrerDepense({
    date: jourSaisi(formData.get("date")) ?? new Date(),
    categorie: "COMMISSION",
    libelle: `Commission ${partenaire.nom}`,
    montant: entier(formData.get("montant")) ?? 0,
    mode,
    reference: String(formData.get("reference") ?? "").trim(),
    partenaireId: partenaire.id,
    actor: user,
  });
  if (!resultat.ok) return { error: resultat.error };
  rafraichir();
  return null;
}

export async function ajouterMateriel(_etat: EtatAction, formData: FormData): Promise<EtatAction> {
  const user = await requireUser();
  if (!peutInventaire(user.role)) return { error: "Réservé aux moyens généraux." };
  const designation = String(formData.get("designation") ?? "").trim();
  const categorie = String(formData.get("categorie") ?? "").trim() || "Divers";
  const valeur = entier(formData.get("valeurXof"));
  if (!designation) return { error: "Indiquez la désignation." };
  if (valeur == null || valeur < 0) return { error: "Valeur invalide." };
  const materiel = await prisma.materiel.create({
    data: {
      designation,
      categorie,
      numeroSerie: String(formData.get("numeroSerie") ?? "").trim() || null,
      valeurXof: valeur,
      acquisLe: jourSaisi(formData.get("acquisLe")),
      localisation: String(formData.get("localisation") ?? "").trim() || null,
      affecteAId: String(formData.get("affecteAId") ?? "") || null,
    },
  });
  await prisma.audit.create({
    data: { userId: user.id, action: "MATERIEL", entite: "Materiel", entiteId: materiel.id, detail: designation },
  });
  rafraichir();
  return null;
}

export async function modifierMateriel(formData: FormData) {
  const user = await requireUser();
  if (!peutInventaire(user.role)) return;
  const etat = String(formData.get("etat") ?? "") as EtatMateriel;
  if (!ETATS_MATERIEL.some((item) => item.value === etat)) return;
  await prisma.materiel.update({
    where: { id: String(formData.get("materielId") ?? "") },
    data: { etat, affecteAId: String(formData.get("affecteAId") ?? "") || null },
  });
  rafraichir();
}

export async function demanderConge(_etat: EtatAction, formData: FormData): Promise<EtatAction> {
  const user = await requireUser();
  if (user.role === "PARTENAIRE") return { error: "Réservé aux collaborateurs." };
  const type = String(formData.get("type") ?? "") as TypeConge;
  const debut = jourSaisi(formData.get("debut"));
  const fin = jourSaisi(formData.get("fin"));
  if (!TYPES_CONGE.some((item) => item.value === type)) return { error: "Choisissez le type d'absence." };
  if (!debut || !fin) return { error: "Indiquez les dates de début et de fin." };
  if (fin < debut) return { error: "La fin précède le début." };
  const motif = String(formData.get("motif") ?? "").trim();
  await prisma.conge.create({ data: { userId: user.id, type, debut, fin, motif: motif || null } });
  const valideurs = await prisma.user.findMany({ where: { actif: true, role: { in: ["CEO", "ADMINISTRATEUR"] }, NOT: { id: user.id } } });
  await prisma.notificationInterne.createMany({
    data: valideurs.map((valideur) => ({
      userId: valideur.id,
      titre: "Demande d'absence",
      message: `${user.prenom} ${user.nom} demande une absence.`,
      lien: "/conges",
    })),
  });
  rafraichir();
  return null;
}

export async function traiterConge(formData: FormData) {
  const user = await requireUser();
  if (!peutValiderConges(user.role)) return;
  const decision = String(formData.get("decision") ?? "");
  if (decision !== "VALIDE" && decision !== "REFUSE") return;
  const conge = await prisma.conge.findUnique({ where: { id: String(formData.get("congeId") ?? "") } });
  if (!conge || conge.statut !== "DEMANDE") return;
  await prisma.conge.update({ where: { id: conge.id }, data: { statut: decision, traiteParId: user.id } });
  await prisma.notificationInterne.create({
    data: {
      userId: conge.userId,
      titre: "Absence",
      message: decision === "VALIDE" ? "Votre demande d'absence est validée." : "Votre demande d'absence est refusée.",
      lien: "/conges",
    },
  });
  rafraichir();
}

export async function retirerConge(formData: FormData) {
  const user = await requireUser();
  const conge = await prisma.conge.findUnique({ where: { id: String(formData.get("congeId") ?? "") } });
  if (!conge || conge.userId !== user.id || conge.statut !== "DEMANDE") return;
  await prisma.conge.delete({ where: { id: conge.id } });
  rafraichir();
}

export async function creerUtilisateur(_etat: EtatAction, formData: FormData): Promise<EtatAction> {
  const user = await requireUser();
  if (!peutGererEquipe(user.role)) return { error: "Réservé à la direction." };
  const prenom = String(formData.get("prenom") ?? "").trim();
  const nom = String(formData.get("nom") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const telephone = normaliserTelephone(String(formData.get("telephone") ?? ""));
  const role = String(formData.get("role") ?? "") as Role;
  const motDePasse = String(formData.get("motDePasse") ?? "");
  const superieurId = String(formData.get("superieurId") ?? "") || null;
  if (!prenom || !nom || !email || !ROLES.some((item) => item.value === role)) {
    return { error: "Complétez l'identité et le rôle." };
  }
  if (!telephoneValide(telephone)) return { error: "Téléphone international invalide." };
  if (motDePasse.length < 8) return { error: "Le mot de passe contient au moins 8 caractères." };
  try {
    await prisma.user.create({
      data: {
        prenom,
        nom,
        email,
        telephone,
        role,
        superieurId,
        motDePasseHash: await bcrypt.hash(motDePasse, 10),
      },
    });
  } catch {
    return { error: "Cet e-mail ou ce téléphone est déjà utilisé." };
  }
  rafraichir();
  return null;
}

export async function basculerActif(formData: FormData) {
  const user = await requireUser();
  if (!peutGererEquipe(user.role)) return;
  const cible = await prisma.user.findUnique({ where: { id: String(formData.get("userId") ?? "") } });
  if (!cible || cible.id === user.id) return;
  await prisma.user.update({ where: { id: cible.id }, data: { actif: !cible.actif } });
  rafraichir();
}

export async function lancerAlertes() {
  const user = await requireUser();
  if (!voitDirection(user.role)) return;
  await scannerAlertes();
  rafraichir();
}

export async function modifierModele(_etat: EtatAction, formData: FormData): Promise<EtatAction> {
  const user = await requireUser();
  if (!voitDirection(user.role)) return { error: "Réservé à la direction." };
  const corps = String(formData.get("corps") ?? "").trim();
  if (!corps) return { error: "Le message est vide." };
  await prisma.modeleSms.update({
    where: { code: String(formData.get("code") ?? "") },
    data: { corps },
  });
  rafraichir();
  return null;
}
