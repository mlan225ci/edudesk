"use server";

import { unlink } from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import { formatJour, nomComplet, rendreModele, xof } from "@/lib/format";
import { labelMode } from "@/lib/labels";
import { lienSuivi } from "@/lib/suivi";
import type { EtatAction } from "@/server/actions";
import { envoyerPiecesManquantes, refuserDepotClient } from "@/server/engine";
import { emailValide, envoyerMailDirect, expedierMail } from "@/server/mail";
import { pieceJointe } from "@/server/pdf-commercial";
import { lireEntreprise, urlPublique } from "@/server/parametres";
import { voitDirection, voitFinance } from "@/server/permissions";
import { requireUser } from "@/server/session";

async function urlDuSite() {
  const entetes = await headers();
  const hote = entetes.get("x-forwarded-host") ?? entetes.get("host");
  if (!hote) return null;
  return `${entetes.get("x-forwarded-proto") ?? (hote.startsWith("localhost") ? "http" : "https")}://${hote}`;
}

type ModeleCourrier = { code: string; libelle: string; sujet: string; corps: string };
type ContexteCourrier = { id: string; libelle: string; modeles: ModeleCourrier[] };

function libelleCourrier(libelle: string) {
  const court = libelle.replace(/^Client,\s*/i, "");
  return court.charAt(0).toLocaleUpperCase("fr") + court.slice(1);
}

export async function textesCourrier(clientId: string): Promise<{ email: string; contextes: ContexteCourrier[] } | null> {
  const user = await requireUser();
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: {
      prenom: true,
      nom: true,
      email: true,
      partenaireId: true,
      dossiers: {
        orderBy: { ouvertLe: "desc" },
        select: {
          id: true,
          reference: true,
          codeSuivi: true,
          procedure: { select: { nom: true, destination: true } },
          etapes: { orderBy: { rang: "asc" }, select: { titre: true, statut: true } },
          pieces: {
            where: {
              recue: false,
              fichierChemin: null,
              reportee: false,
              OR: [{ dossierEtapeId: null }, { etape: { statut: { not: "A_VENIR" } } }],
            },
            orderBy: [{ obligatoire: "desc" }, { ordre: "asc" }],
            select: { libelle: true, obligatoire: true },
          },
          candidatures: {
            where: { statut: { in: ["CHOISIE", "ADMIS"] } },
            orderBy: { creeLe: "desc" },
            select: { statut: true, formation: true, ecole: { select: { nom: true } } },
          },
          devis: { orderBy: { creeLe: "desc" }, take: 1, select: { numero: true, total: true, validiteLe: true } },
          factures: { where: { annuleeLe: null }, orderBy: { creeLe: "desc" }, take: 1, select: { numero: true } },
          paiements: { orderBy: { dateEncaissement: "desc" }, take: 1, select: { montant: true, mode: true } },
        },
      },
    },
  });
  if (!client || !emailValide(client.email)) return null;
  if (user.role === "PARTENAIRE" && client.partenaireId !== user.partenaireId) return null;

  const [entreprise, lien, modeles] = await Promise.all([
    lireEntreprise(),
    urlPublique().then((url) => lienSuivi(url)),
    prisma.modeleSms.findMany({ where: { code: { startsWith: "client_" } }, orderBy: { libelle: "asc" } }),
  ]);

  const rendre = (dossier: (typeof client.dossiers)[number] | null) => {
    const etape = dossier?.etapes.find((item) => item.statut === "EN_COURS") ?? dossier?.etapes.findLast((item) => item.statut === "CLOTUREE");
    const ecole = dossier?.candidatures.find((item) => item.statut === "CHOISIE") ?? dossier?.candidatures[0];
    const devis = dossier?.devis[0];
    const paiement = dossier?.paiements[0];
    const code = dossier?.codeSuivi ?? "";
    const variables: Record<string, string> = {
      entreprise: entreprise.nom,
      prenom: client.prenom,
      client: nomComplet(client),
      reference: dossier?.reference ?? "",
      destination: dossier?.procedure.destination ?? "",
      etape: etape?.titre ?? "",
      code,
      lien,
      suivi: code ? `Suivez votre dossier à tout moment sur ${lien} avec le code ${code}.` : "",
      ecole: ecole?.ecole.nom ?? "",
      formation: ecole?.formation ? ` (${ecole.formation})` : "",
      nombre: String(dossier?.pieces.length ?? 0),
      pieces: dossier?.pieces.map((piece) => piece.libelle).join(", ") ?? "",
      liste: dossier?.pieces.map((piece) => `• ${piece.libelle}${piece.obligatoire ? "" : " (facultatif)"}`).join("\n") ?? "",
      depot: code
        ? `Vous pouvez les déposer directement en ligne sur ${lien} avec votre code de suivi ${code}, ou les apporter à l'agence.`
        : "Merci de les apporter à l'agence ou de les transmettre à votre conseiller.",
      devis: devis?.numero ?? "",
      montant: paiement ? xof(paiement.montant) : devis ? xof(devis.total) : "",
      mode: paiement ? labelMode(paiement.mode) : "",
      facture: dossier?.factures[0]?.numero ?? "",
      validite: devis?.validiteLe
        ? `Ce devis est valable jusqu'au ${new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "Africa/Abidjan" }).format(devis.validiteLe)}.\n\n`
        : "",
    };
    return modeles.map((modele) => {
      const propres = modele.code === "client_devis" && devis ? { ...variables, montant: xof(devis.total) } : variables;
      return {
        code: modele.code,
        libelle: libelleCourrier(modele.libelle),
        sujet: rendreModele(modele.sujet || "Votre dossier {{reference}}", propres).replace(/\s+/g, " ").trim().slice(0, 200),
        corps: rendreModele(modele.corpsMail || modele.corps, propres).replace(/\n{3,}/g, "\n\n").trim(),
      };
    });
  };

  const contextes = client.dossiers.length
    ? client.dossiers.map((dossier) => ({
        id: dossier.id,
        libelle: `${dossier.reference} · ${dossier.procedure.nom}`,
        modeles: rendre(dossier),
      }))
    : [{ id: "", libelle: "Sans dossier", modeles: rendre(null) }];

  return { email: client.email!.trim(), contextes };
}

export async function envoyerCourrier(_etat: EtatAction, formData: FormData): Promise<EtatAction> {
  const user = await requireUser();
  if (user.role === "PARTENAIRE") return { error: "Action réservée aux collaborateurs." };
  const client = await prisma.client.findUnique({
    where: { id: String(formData.get("clientId") ?? "") },
    select: { id: true, email: true },
  });
  if (!client) return { error: "Client introuvable." };
  if (!emailValide(client.email)) return { error: "Ce client n'a pas d'adresse e-mail valide." };
  const dossierId = String(formData.get("dossierId") ?? "").trim();
  if (dossierId) {
    const dossier = await prisma.dossier.findFirst({ where: { id: dossierId, clientId: client.id }, select: { id: true } });
    if (!dossier) return { error: "Ce dossier n'appartient pas à ce client." };
  }
  const sujet = String(formData.get("sujet") ?? "").replace(/\s+/g, " ").trim();
  let corps = String(formData.get("corps") ?? "").replace(/\r/g, "").trim();
  const modele = String(formData.get("modele") ?? "");
  if (!sujet) return { error: "Indiquez l'objet de l'e-mail." };
  if (sujet.length > 200) return { error: "L'objet ne peut pas dépasser 200 caractères." };
  if (!corps) return { error: "Écrivez le message." };
  if (corps.length > 8000) return { error: "Le message ne peut pas dépasser 8 000 caractères." };

  let piece: string | null = null;
  if (dossierId && modele === "client_devis") {
    const devis = await prisma.devis.findFirst({
      where: { dossierId, statut: { not: "REFUSE" } },
      orderBy: { creeLe: "desc" },
      select: { id: true },
    });
    if (devis) piece = `devis:${devis.id}`;
  }
  if (!piece && /ci-joint/i.test(corps)) corps = corps.replace(/trouver ci-joint/gi, "trouver ci-dessous");
  const fichier = await pieceJointe(piece);
  const ligne = await prisma.notificationMail.create({
    data: {
      destinataire: client.email!.trim(),
      type: "CLIENT",
      dossierId: dossierId || null,
      sujet,
      corps,
      pieceJointe: piece,
    },
  });
  try {
    const resultat = await envoyerMailDirect({
      a: client.email!.trim(),
      sujet,
      corps,
      pieces: fichier ? [fichier] : [],
    });
    await prisma.notificationMail.update({ where: { id: ligne.id }, data: { statut: resultat.statut, envoyeLe: new Date(), erreur: null } });
    if (resultat.statut === "JOURNAL") {
      revalidatePath("/", "layout");
      return { error: "Aucun serveur e-mail branché (Paramètres › E-mail) : l'envoi a seulement été journalisé." };
    }
  } catch (erreur) {
    const detail = erreur instanceof Error ? erreur.message : "Erreur inconnue";
    await prisma.notificationMail.update({ where: { id: ligne.id }, data: { statut: "ECHEC", erreur: detail.slice(0, 500) } });
    revalidatePath("/", "layout");
    return { error: `Le serveur a refusé l'envoi : ${detail}.` };
  }
  await prisma.audit.create({
    data: {
      userId: user.id,
      action: "COURRIER",
      entite: dossierId ? "Dossier" : "Client",
      entiteId: dossierId || client.id,
      detail: `${sujet} → ${client.email}`.slice(0, 300),
    },
  });
  revalidatePath("/", "layout");
  const envoi = await prisma.notificationMail.findUnique({ where: { id: ligne.id } });
  if (envoi?.statut === "ECHEC") return { error: `Le serveur a refusé l'envoi : ${envoi.erreur ?? "erreur inconnue"}.` };
  if (envoi?.statut === "JOURNAL") return { error: "Aucun serveur e-mail branché (Paramètres › E-mail) : l'envoi a seulement été journalisé." };
  return null;
}

export async function renvoyerMail(id: string) {
  const user = await requireUser();
  if (!voitDirection(user.role)) return;
  const mail = await prisma.notificationMail.findUnique({ where: { id } });
  if (!mail || mail.statut === "ENVOYE") return;
  await prisma.notificationMail.update({ where: { id }, data: { statut: "EN_ATTENTE", erreur: null } });
  await expedierMail(id);
  revalidatePath("/", "layout");
}

export async function envoyerFactureParMail(_etat: EtatAction, formData: FormData): Promise<EtatAction> {
  const user = await requireUser();
  if (!voitFinance(user.role)) return { error: "Réservé à la finance et à la direction." };
  const facture = await prisma.facture.findUnique({
    where: { id: String(formData.get("factureId") ?? "") },
    include: { paiement: true, reglements: { select: { montant: true } }, dossier: { include: { client: true, procedure: true } } },
  });
  if (!facture) return { error: "Facture introuvable." };
  if (facture.annuleeLe) return { error: "Cette facture est annulée : elle ne peut plus être envoyée." };
  const destinataire = String(formData.get("email") ?? "").trim() || facture.dossier.client.email;
  if (!emailValide(destinataire)) return { error: "Indiquez une adresse e-mail valide." };
  const entreprise = await lireEntreprise();
  const regle = facture.paiement ? facture.montant : facture.reglements.reduce((somme, reglement) => somme + reglement.montant, 0);
  const reste = Math.max(facture.montant - regle, 0);
  const situation = facture.paiement
    ? `acquittée le ${formatJour(facture.paiement.dateEncaissement)}`
    : reste === 0
      ? "entièrement réglée"
      : `dont il reste ${xof(reste)} à régler${facture.echeanceLe ? ` avant le ${formatJour(facture.echeanceLe)}` : ""}`;
  const ligne = await prisma.notificationMail.create({
    data: {
      destinataire: destinataire!.trim(),
      type: "CLIENT",
      dossierId: facture.dossierId,
      sujet: `Facture ${facture.numero} – ${entreprise.nom}`,
      corps: `Bonjour ${facture.dossier.client.prenom},\n\nVeuillez trouver ci-joint la facture ${facture.numero} d'un montant de ${xof(facture.montant)}, ${situation}, pour votre dossier ${facture.dossier.procedure.destination} (${facture.dossier.reference}).\n\nCordialement,\nL'équipe ${entreprise.nom}`,
      pieceJointe: `facture:${facture.id}`,
    },
  });
  await expedierMail(ligne.id);
  await prisma.facture.update({ where: { id: facture.id }, data: { envoyeeLe: new Date() } });
  await prisma.audit.create({
    data: { userId: user.id, action: "FACTURE_ENVOYEE", entite: "Dossier", entiteId: facture.dossierId, detail: `${facture.numero} → ${destinataire}` },
  });
  revalidatePath("/", "layout");
  const envoi = await prisma.notificationMail.findUnique({ where: { id: ligne.id } });
  if (envoi?.statut === "ECHEC") return { error: `Le serveur a refusé l'envoi : ${envoi.erreur ?? "erreur inconnue"}.` };
  if (envoi?.statut === "JOURNAL") return { error: "Aucun serveur e-mail branché (Paramètres › E-mail) : l'envoi a seulement été journalisé." };
  return null;
}

export async function validerDepot(pieceId: string) {
  const user = await requireUser();
  if (user.role === "PARTENAIRE") return;
  const piece = await prisma.pieceDossier.findUnique({ where: { id: pieceId } });
  if (!piece || piece.recue || !piece.fichierChemin) return;
  await prisma.pieceDossier.update({ where: { id: piece.id }, data: { recue: true, recueLe: new Date(), recueParId: user.id } });
  await prisma.audit.create({ data: { userId: user.id, action: "PIECE_RECUE", entite: "Dossier", entiteId: piece.dossierId, detail: `${piece.libelle} (dépôt client validé)` } });
  revalidatePath("/", "layout");
}

export async function refuserDepot(pieceId: string) {
  const user = await requireUser();
  if (user.role === "PARTENAIRE") return;
  const chemin = await refuserDepotClient({ pieceId, actor: user });
  if (chemin) await unlink(path.join(process.cwd(), "storage", "pieces", path.basename(chemin))).catch(() => undefined);
  revalidatePath("/", "layout");
}

export async function relancerPieces(_etat: EtatAction, formData: FormData): Promise<EtatAction> {
  const user = await requireUser();
  if (user.role === "PARTENAIRE") return { error: "Action réservée aux collaborateurs." };
  const resultat = await envoyerPiecesManquantes({
    dossierId: String(formData.get("dossierId") ?? ""),
    actor: user,
    baseUrl: await urlDuSite(),
  });
  if (!resultat.ok) return { error: resultat.error };
  revalidatePath("/", "layout");
  return null;
}
