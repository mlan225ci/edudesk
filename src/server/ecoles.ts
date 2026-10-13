"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { Prisma, StatutCandidature } from "@prisma/client";
import { prisma } from "@/lib/db";
import { STATUTS_CANDIDATURE } from "@/lib/labels";
import { PAYS } from "@/lib/pays";
import { annoncerAdmission } from "@/server/engine";
import { peutCandidatures, peutEcoles } from "@/server/permissions";
import { requireUser } from "@/server/session";
import type { EtatAction } from "@/server/actions";

const STATUTS = Object.keys(STATUTS_CANDIDATURE) as StatutCandidature[];

function texte(formData: FormData, cle: string) {
  return String(formData.get(cle) ?? "").trim();
}

function facultatif(formData: FormData, cle: string) {
  return texte(formData, cle) || null;
}

function montant(formData: FormData, cle: string) {
  const brut = texte(formData, cle).replace(/[\s\u202f.]/g, "");
  if (brut === "") return 0;
  const valeur = Number(brut);
  return Number.isInteger(valeur) && valeur >= 0 ? valeur : null;
}

function rafraichir() {
  revalidatePath("/", "layout");
}

async function urlDuSite() {
  const entetes = await headers();
  const hote = entetes.get("x-forwarded-host") ?? entetes.get("host");
  if (!hote) return null;
  return `${entetes.get("x-forwarded-proto") ?? (hote.startsWith("localhost") ? "http" : "https")}://${hote}`;
}

async function gestionnaire() {
  const user = await requireUser();
  if (!peutEcoles(user.role)) throw new Error("Action non autorisée.");
  return user;
}

function donneesEcole(formData: FormData) {
  const nom = texte(formData, "nom");
  const pays = texte(formData, "pays");
  const fraisXof = montant(formData, "fraisXof");
  const commissionXof = montant(formData, "commissionXof");
  if (!nom || !pays) return { ok: false as const, error: "Le nom et le pays sont obligatoires." };
  if (!PAYS.includes(pays)) return { ok: false as const, error: "Choisissez un pays dans la liste." };
  if (fraisXof == null || commissionXof == null) return { ok: false as const, error: "Les montants sont des nombres entiers de francs CFA." };
  const partenaire = formData.get("partenaire") === "on";
  return {
    ok: true as const,
    data: {
      nom,
      pays,
      ville: facultatif(formData, "ville"),
      type: facultatif(formData, "type"),
      formations: facultatif(formData, "formations"),
      fraisXof: fraisXof || null,
      rentrees: facultatif(formData, "rentrees"),
      contactNom: facultatif(formData, "contactNom"),
      telephone: facultatif(formData, "telephone"),
      email: facultatif(formData, "email"),
      siteWeb: facultatif(formData, "siteWeb"),
      partenaire,
      commissionXof: partenaire ? commissionXof : 0,
      notes: facultatif(formData, "notes"),
    },
  };
}

export async function creerEcole(_etat: EtatAction, formData: FormData): Promise<EtatAction> {
  const user = await gestionnaire();
  const saisie = donneesEcole(formData);
  if (!saisie.ok) return { error: saisie.error };
  const doublon = await prisma.ecole.findFirst({
    where: { nom: { equals: saisie.data.nom, mode: "insensitive" }, pays: saisie.data.pays },
    select: { id: true },
  });
  if (doublon) return { error: "Cette école existe déjà dans ce pays." };
  const ecole = await prisma.ecole.create({ data: saisie.data });
  await prisma.audit.create({ data: { userId: user.id, action: "ECOLE", entite: "Ecole", entiteId: ecole.id, detail: `Ajout de ${ecole.nom}` } });
  rafraichir();
  return null;
}

export async function modifierEcole(_etat: EtatAction, formData: FormData): Promise<EtatAction> {
  const user = await gestionnaire();
  const id = texte(formData, "ecoleId");
  const saisie = donneesEcole(formData);
  if (!saisie.ok) return { error: saisie.error };
  const doublon = await prisma.ecole.findFirst({
    where: { nom: { equals: saisie.data.nom, mode: "insensitive" }, pays: saisie.data.pays, NOT: { id } },
    select: { id: true },
  });
  if (doublon) return { error: "Une autre école porte ce nom dans ce pays." };
  await prisma.ecole.update({ where: { id }, data: { ...saisie.data, actif: formData.get("actif") === "on" } });
  await prisma.audit.create({ data: { userId: user.id, action: "ECOLE", entite: "Ecole", entiteId: id, detail: `Fiche ${saisie.data.nom} modifiée` } });
  rafraichir();
  return null;
}

export async function supprimerEcole(formData: FormData) {
  const user = await gestionnaire();
  const id = texte(formData, "ecoleId");
  const ecole = await prisma.ecole.findUnique({ where: { id }, include: { _count: { select: { candidatures: true } } } });
  if (!ecole) return;
  if (ecole._count.candidatures > 0) {
    await prisma.ecole.update({ where: { id }, data: { actif: false } });
  } else {
    await prisma.ecole.delete({ where: { id } });
  }
  await prisma.audit.create({
    data: { userId: user.id, action: "ECOLE", entite: "Ecole", entiteId: id, detail: ecole._count.candidatures > 0 ? `${ecole.nom} archivée` : `${ecole.nom} supprimée` },
  });
  rafraichir();
  redirect("/ecoles");
}

async function collaborateur() {
  const user = await requireUser();
  if (!peutCandidatures(user.role)) throw new Error("Action non autorisée.");
  return user;
}

export async function proposerEcole(_etat: EtatAction, formData: FormData): Promise<EtatAction> {
  const user = await requireUser();
  if (!peutCandidatures(user.role)) return { error: "Action réservée à l'équipe des dossiers." };
  const dossierId = texte(formData, "dossierId");
  const ecoleId = texte(formData, "ecoleId");
  const formation = facultatif(formData, "formation");
  if (!ecoleId) return { error: "Choisissez une école." };
  const [dossier, ecole] = await Promise.all([
    prisma.dossier.findUnique({ where: { id: dossierId }, select: { id: true } }),
    prisma.ecole.findUnique({ where: { id: ecoleId } }),
  ]);
  if (!dossier || !ecole) return { error: "Dossier ou école introuvable." };
  const existante = await prisma.candidature.findFirst({
    where: { dossierId, ecoleId, formation: formation ?? null, statut: { not: "ABANDONNEE" } },
    select: { id: true },
  });
  if (existante) return { error: "Cette école est déjà proposée pour cette formation." };
  await prisma.candidature.create({ data: { dossierId, ecoleId, formation, observation: facultatif(formData, "observation"), creeParId: user.id } });
  await prisma.audit.create({
    data: { userId: user.id, action: "CANDIDATURE", entite: "Dossier", entiteId: dossierId, detail: `${ecole.nom}${formation ? ` (${formation})` : ""} proposée` },
  });
  rafraichir();
  return null;
}

export async function changerStatutCandidature(formData: FormData) {
  const user = await collaborateur();
  const statut = texte(formData, "statut") as StatutCandidature;
  if (!STATUTS.includes(statut)) return;
  const candidature = await prisma.candidature.findUnique({ where: { id: texte(formData, "candidatureId") }, include: { ecole: true } });
  if (!candidature || candidature.statut === statut) return;

  const maintenant = new Date();
  const data: Prisma.CandidatureUpdateInput = { statut };
  if (statut === "SOUMISE" && !candidature.soumiseLe) data.soumiseLe = maintenant;
  if ((statut === "ADMIS" || statut === "REFUSE" || statut === "CHOISIE") && !candidature.reponseLe) data.reponseLe = maintenant;

  await prisma.$transaction(async (tx) => {
    if (statut === "CHOISIE") {
      await tx.candidature.updateMany({ where: { dossierId: candidature.dossierId, statut: "CHOISIE" }, data: { statut: "ADMIS" } });
    }
    await tx.candidature.update({ where: { id: candidature.id }, data });
    await tx.audit.create({
      data: {
        userId: user.id,
        action: "CANDIDATURE",
        entite: "Dossier",
        entiteId: candidature.dossierId,
        detail: `${candidature.ecole.nom} : ${STATUTS_CANDIDATURE[statut]}`,
      },
    });
  });

  if (statut === "ADMIS" && candidature.statut !== "CHOISIE") {
    await annoncerAdmission({ candidatureId: candidature.id, baseUrl: await urlDuSite() });
  }
  rafraichir();
}

export async function retirerCandidature(formData: FormData) {
  const user = await collaborateur();
  const candidature = await prisma.candidature.findUnique({ where: { id: texte(formData, "candidatureId") }, include: { ecole: true } });
  if (!candidature) return;
  await prisma.candidature.delete({ where: { id: candidature.id } });
  await prisma.audit.create({
    data: { userId: user.id, action: "CANDIDATURE", entite: "Dossier", entiteId: candidature.dossierId, detail: `${candidature.ecole.nom} retirée` },
  });
  rafraichir();
}
