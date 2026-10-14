"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { AcompteExige, EffetIssue, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ROLES } from "@/lib/labels";
import { peutProcedures } from "@/server/permissions";
import { requireUser } from "@/server/session";
import type { EtatAction } from "@/server/actions";

type Tx = Prisma.TransactionClient;

const ACOMPTES: AcompteExige[] = ["AUCUN", "DOSSIER", "SCOLARITE", "FRAIS"];
const JALONS = ["", "CONTRAT", "DECISION", "DEPART"];
const EFFETS: EffetIssue[] = ["SUITE", "BOUCLE", "RELANCE"];

const PARCOURS_DE_BASE = [
  {
    titre: "Conseil et orientation",
    delaiHeures: 48,
    roles: "RESPONSABLE_COMMERCIALE,COMMERCIAL",
    acompte: "AUCUN" as const,
    jalon: null,
    taches: ["Comprendre les besoins", "Présenter les services", "Orienter"],
    pieces: [] as string[],
  },
  {
    titre: "Signature du contrat",
    delaiHeures: null,
    roles: "RESPONSABLE_COMMERCIALE,ADMINISTRATEUR",
    acompte: "DOSSIER" as const,
    jalon: "CONTRAT",
    taches: ["Faire signer le contrat", "Encaisser l'acompte", "Ouvrir le dossier"],
    pieces: ["Contrat signé"],
  },
  {
    titre: "Départ et suivi",
    delaiHeures: null,
    roles: "RESPONSABLE_COMMERCIALE",
    acompte: "AUCUN" as const,
    jalon: "DEPART",
    taches: ["Conseils de départ", "Suivi du séjour"],
    pieces: [] as string[],
  },
];

async function autoriser() {
  const user = await requireUser();
  if (!peutProcedures(user.role)) throw new Error("Modification non autorisée.");
  return user;
}

function direction(role: string) {
  return role === "CEO" || role === "ADMINISTRATEUR";
}

function texte(formData: FormData, cle: string) {
  return String(formData.get(cle) ?? "").trim();
}

function montant(formData: FormData, cle: string) {
  const brut = texte(formData, cle).replace(/[\s\u202f.]/g, "");
  if (brut === "") return 0;
  const valeur = Number(brut);
  return Number.isInteger(valeur) && valeur >= 0 ? valeur : null;
}

function delai(formData: FormData) {
  const brut = texte(formData, "delaiHeures");
  if (brut === "") return { ok: true as const, valeur: null };
  const valeur = Number(brut);
  if (!Number.isInteger(valeur) || valeur < 0) return { ok: false as const };
  return { ok: true as const, valeur };
}

function roles(formData: FormData) {
  return formData.getAll("roles").map(String).filter((role) => role !== "PARTENAIRE" && ROLES.some((item) => item.value === role));
}

async function codeLibre(tx: Tx, nom: string) {
  const base =
    nom
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 24) || "PROCEDURE";
  let code = base;
  for (let suffixe = 2; await tx.procedure.findUnique({ where: { code }, select: { id: true } }); suffixe++) code = `${base}_${suffixe}`;
  return code;
}

async function nouvelleVersion(tx: Tx, procedureId: string) {
  await tx.procedure.update({ where: { id: procedureId }, data: { version: { increment: 1 } } });
}

async function renumeroter(tx: Tx, procedureId: string, ordre?: string[]) {
  const etapes = await tx.etapeModele.findMany({ where: { procedureId }, orderBy: { rang: "asc" }, select: { id: true } });
  const ids = ordre ?? etapes.map((etape) => etape.id);
  for (const [index, id] of ids.entries()) await tx.etapeModele.update({ where: { id }, data: { rang: -(index + 1) } });
  for (const [index, id] of ids.entries()) await tx.etapeModele.update({ where: { id }, data: { rang: index + 1 } });
}

function rafraichir() {
  revalidatePath("/", "layout");
}

export async function creerProcedure(_etat: EtatAction, formData: FormData): Promise<EtatAction> {
  const user = await autoriser();
  const nom = texte(formData, "nom");
  const destination = texte(formData, "destination");
  const base = texte(formData, "base");
  const tarifXof = montant(formData, "tarifXof");
  const commissionXof = montant(formData, "commissionXof");
  if (!nom || !destination) return { error: "Le nom et la destination sont obligatoires." };
  if (tarifXof == null || commissionXof == null) return { error: "Les montants sont des nombres entiers de francs CFA." };
  if (await prisma.procedure.findFirst({ where: { nom: { equals: nom, mode: "insensitive" } }, select: { id: true } })) {
    return { error: "Une procédure porte déjà ce nom." };
  }

  const modele = base && base !== "base"
    ? await prisma.procedure.findUnique({
        where: { id: base },
        include: { etapes: { orderBy: { rang: "asc" }, include: { taches: true, pieces: true, issues: true } } },
      })
    : null;

  const procedure = await prisma.$transaction(async (tx) => {
    const creee = await tx.procedure.create({
      data: {
        code: await codeLibre(tx, nom),
        nom,
        destination,
        actif: false,
        ecoles: formData.get("ecoles") === "on" || Boolean(modele?.ecoles),
        tarifXof: direction(user.role) ? tarifXof : modele?.tarifXof ?? 0,
        commissionXof: direction(user.role) ? commissionXof : modele?.commissionXof ?? 0,
      },
    });
    const etapes = modele
      ? modele.etapes.map((etape) => ({
          titre: etape.titre,
          delaiHeures: etape.delaiHeures,
          roles: etape.roles,
          acompte: etape.acompte,
          jalon: etape.jalon,
          choixEcole: etape.choixEcole,
          taches: etape.taches.sort((a, b) => a.ordre - b.ordre).map((tache) => ({ libelle: tache.libelle, obligatoire: tache.obligatoire })),
          pieces: etape.pieces.sort((a, b) => a.ordre - b.ordre).map((piece) => ({ libelle: piece.libelle, obligatoire: piece.obligatoire })),
          issues: etape.issues.sort((a, b) => a.ordre - b.ordre).map((issue) => ({ libelle: issue.libelle, effet: issue.effet })),
        }))
      : PARCOURS_DE_BASE.map((etape) => ({
          ...etape,
          choixEcole: false,
          taches: etape.taches.map((libelle) => ({ libelle, obligatoire: true })),
          pieces: etape.pieces.map((libelle) => ({ libelle, obligatoire: true })),
          issues: [] as { libelle: string; effet: EffetIssue }[],
        }));
    for (const [index, etape] of etapes.entries()) {
      await tx.etapeModele.create({
        data: {
          procedureId: creee.id,
          rang: index + 1,
          titre: etape.titre,
          delaiHeures: etape.delaiHeures,
          roles: etape.roles,
          acompte: etape.acompte,
          jalon: etape.jalon,
          choixEcole: etape.choixEcole,
          taches: { create: etape.taches.map((tache, ordre) => ({ ...tache, ordre: ordre + 1 })) },
          pieces: { create: etape.pieces.map((piece, ordre) => ({ ...piece, ordre: ordre + 1 })) },
          issues: { create: etape.issues.map((issue, ordre) => ({ ...issue, ordre: ordre + 1 })) },
        },
      });
    }
    await tx.audit.create({ data: { userId: user.id, action: "PROCEDURE", entite: "Procedure", entiteId: creee.id, detail: `Création de ${nom}` } });
    return creee;
  });

  rafraichir();
  redirect(`/parametres/procedures/${procedure.id}`);
}

export async function modifierProcedure(_etat: EtatAction, formData: FormData): Promise<EtatAction> {
  const user = await autoriser();
  const id = texte(formData, "procedureId");
  const nom = texte(formData, "nom");
  const destination = texte(formData, "destination");
  if (!nom || !destination) return { error: "Le nom et la destination sont obligatoires." };
  if (await prisma.procedure.findFirst({ where: { nom: { equals: nom, mode: "insensitive" }, NOT: { id } }, select: { id: true } })) {
    return { error: "Une autre procédure porte déjà ce nom." };
  }
  const data: Prisma.ProcedureUpdateInput = { nom, destination, ecoles: formData.get("ecoles") === "on", version: { increment: 1 } };
  if (direction(user.role)) {
    const tarifXof = montant(formData, "tarifXof");
    const commissionXof = montant(formData, "commissionXof");
    if (tarifXof == null || commissionXof == null) return { error: "Les montants sont des nombres entiers de francs CFA." };
    data.tarifXof = tarifXof;
    data.commissionXof = commissionXof;
  }
  await prisma.procedure.update({ where: { id }, data });
  rafraichir();
  return null;
}

export async function publierProcedure(_etat: EtatAction, formData: FormData): Promise<EtatAction> {
  const user = await autoriser();
  const procedure = await prisma.procedure.findUnique({
    where: { id: texte(formData, "procedureId") },
    include: { etapes: { include: { taches: true } } },
  });
  if (!procedure) return { error: "Procédure introuvable." };

  if (!procedure.actif) {
    if (procedure.etapes.length === 0) return { error: "Ajoutez au moins une étape avant de publier." };
    if (!procedure.etapes.some((etape) => etape.acompte === "DOSSIER")) {
      return { error: "Aucune étape n'exige l'acompte d'ouverture : un dossier ne peut pas être ouvert sans contrat signé ni acompte." };
    }
    const sansRole = procedure.etapes.find((etape) => !etape.roles);
    if (sansRole) return { error: `Indiquez qui s'occupe de l'étape « ${sansRole.titre} ».` };
  }

  await prisma.procedure.update({ where: { id: procedure.id }, data: { actif: !procedure.actif } });
  await prisma.audit.create({
    data: { userId: user.id, action: "PROCEDURE", entite: "Procedure", entiteId: procedure.id, detail: procedure.actif ? `Mise en pause de ${procedure.nom}` : `Publication de ${procedure.nom}` },
  });
  rafraichir();
  return null;
}

export async function supprimerProcedure(formData: FormData) {
  const user = await autoriser();
  const id = texte(formData, "procedureId");
  const procedure = await prisma.procedure.findUnique({ where: { id }, include: { _count: { select: { dossiers: true } } } });
  if (!procedure) return;
  if (procedure._count.dossiers > 0) throw new Error("Des dossiers utilisent cette procédure.");
  await prisma.procedure.delete({ where: { id } });
  await prisma.audit.create({ data: { userId: user.id, action: "PROCEDURE", entite: "Procedure", entiteId: id, detail: `Suppression de ${procedure.nom}` } });
  rafraichir();
  redirect("/parametres/procedures");
}

export async function modifierEtapeModele(_etat: EtatAction, formData: FormData): Promise<EtatAction> {
  await autoriser();
  const etape = await prisma.etapeModele.findUnique({ where: { id: texte(formData, "etapeId") } });
  if (!etape) return { error: "Étape introuvable." };
  const titre = texte(formData, "titre");
  const delaiSaisi = delai(formData);
  const choisis = roles(formData);
  const jalon = texte(formData, "jalon");
  const choixEcole = formData.get("choixEcole") === "on";
  let acompte = texte(formData, "acompte") as AcompteExige;
  if (!titre) return { error: "Le titre est obligatoire." };
  if (!delaiSaisi.ok) return { error: "Le délai est un nombre d'heures, ou vide." };
  if (choisis.length === 0) return { error: "Choisissez au moins une personne responsable." };
  if (!JALONS.includes(jalon) || !ACOMPTES.includes(acompte)) return { error: "Choix invalide." };
  if (jalon === "CONTRAT" && acompte === "AUCUN") acompte = "DOSSIER";

  await prisma.$transaction(async (tx) => {
    if (jalon === "CONTRAT") {
      await tx.etapeModele.updateMany({ where: { procedureId: etape.procedureId, jalon: "CONTRAT", NOT: { id: etape.id } }, data: { jalon: null } });
    }
    await tx.etapeModele.update({
      where: { id: etape.id },
      data: { titre, delaiHeures: delaiSaisi.valeur, roles: choisis.join(","), acompte, jalon: jalon || null, choixEcole },
    });
    if (choixEcole) await tx.procedure.update({ where: { id: etape.procedureId }, data: { ecoles: true } });
    await nouvelleVersion(tx, etape.procedureId);
  });
  rafraichir();
  return null;
}

export async function deplacerEtapeModele(formData: FormData) {
  await autoriser();
  const etape = await prisma.etapeModele.findUnique({ where: { id: texte(formData, "etapeId") } });
  if (!etape) return;
  const vers = texte(formData, "sens") === "haut" ? -1 : 1;
  await prisma.$transaction(async (tx) => {
    const ids = (await tx.etapeModele.findMany({ where: { procedureId: etape.procedureId }, orderBy: { rang: "asc" }, select: { id: true } })).map((item) => item.id);
    const index = ids.indexOf(etape.id);
    const cible = index + vers;
    if (cible < 0 || cible >= ids.length) return;
    [ids[index], ids[cible]] = [ids[cible], ids[index]];
    await renumeroter(tx, etape.procedureId, ids);
    await nouvelleVersion(tx, etape.procedureId);
  });
  rafraichir();
}

export async function supprimerEtapeModele(formData: FormData) {
  await autoriser();
  const etape = await prisma.etapeModele.findUnique({ where: { id: texte(formData, "etapeId") } });
  if (!etape) return;
  await prisma.$transaction(async (tx) => {
    await tx.etapeModele.delete({ where: { id: etape.id } });
    await renumeroter(tx, etape.procedureId);
    await nouvelleVersion(tx, etape.procedureId);
  });
  rafraichir();
}

export async function ajouterIssueModele(formData: FormData) {
  await autoriser();
  const etape = await prisma.etapeModele.findUnique({ where: { id: texte(formData, "etapeId") } });
  const libelle = texte(formData, "libelle");
  const effet = texte(formData, "effet") as EffetIssue;
  if (!etape || !libelle || !EFFETS.includes(effet)) return;
  const ordre = (await prisma.issueModele.count({ where: { etapeModeleId: etape.id } })) + 1;
  await prisma.$transaction(async (tx) => {
    await tx.issueModele.create({ data: { etapeModeleId: etape.id, ordre, libelle, effet } });
    await nouvelleVersion(tx, etape.procedureId);
  });
  rafraichir();
}

async function procedureDe(sorte: string, id: string) {
  const inclure = { etape: { select: { procedureId: true } } };
  const ligne =
    sorte === "tache"
      ? await prisma.tacheModele.findUnique({ where: { id }, include: inclure })
      : sorte === "piece"
        ? await prisma.pieceModele.findUnique({ where: { id }, include: inclure })
        : sorte === "issue"
          ? await prisma.issueModele.findUnique({ where: { id }, include: inclure })
          : null;
  return ligne?.etape.procedureId ?? null;
}

export async function supprimerElementModele(formData: FormData) {
  await autoriser();
  const sorte = texte(formData, "sorte");
  const id = texte(formData, "id");
  const procedureId = await procedureDe(sorte, id);
  if (!procedureId) return;
  await prisma.$transaction(async (tx) => {
    if (sorte === "tache") await tx.tacheModele.delete({ where: { id } });
    if (sorte === "piece") await tx.pieceModele.delete({ where: { id } });
    if (sorte === "issue") await tx.issueModele.delete({ where: { id } });
    await nouvelleVersion(tx, procedureId);
  });
  rafraichir();
}

export async function basculerObligatoireModele(formData: FormData) {
  await autoriser();
  const sorte = texte(formData, "sorte");
  const id = texte(formData, "id");
  const procedureId = await procedureDe(sorte, id);
  if (!procedureId) return;
  await prisma.$transaction(async (tx) => {
    if (sorte === "tache") {
      const tache = await tx.tacheModele.findUniqueOrThrow({ where: { id } });
      await tx.tacheModele.update({ where: { id }, data: { obligatoire: !tache.obligatoire } });
    }
    if (sorte === "piece") {
      const piece = await tx.pieceModele.findUniqueOrThrow({ where: { id } });
      await tx.pieceModele.update({ where: { id }, data: { obligatoire: !piece.obligatoire } });
    }
    await nouvelleVersion(tx, procedureId);
  });
  rafraichir();
}
