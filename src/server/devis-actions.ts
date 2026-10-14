"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { xof } from "@/lib/format";
import type { EtatAction } from "@/server/actions";
import { creerDevis, envoyerDevisClient } from "@/server/engine";
import { peutDevis } from "@/server/permissions";
import { requireUser } from "@/server/session";

function entier(valeur: FormDataEntryValue | null) {
  return Number(String(valeur ?? "").replace(/[\s\u00a0\u202f]/g, ""));
}

export async function nouveauDevis(_etat: EtatAction, formData: FormData): Promise<EtatAction> {
  const user = await requireUser();
  if (!peutDevis(user.role)) return { error: "Vous ne pouvez pas établir de devis." };
  const libelles = formData.getAll("libelle").map((valeur) => String(valeur).trim());
  const quantites = formData.getAll("quantite");
  const prix = formData.getAll("prix");
  const objet = String(formData.get("objet") ?? "").trim();
  if (!objet) return { error: "Indiquez l'objet du devis." };
  const validite = entier(formData.get("validite"));
  const resultat = await creerDevis({
    dossierId: String(formData.get("dossierId") ?? ""),
    objet,
    lignes: libelles.map((libelle, index) => ({ libelle, quantite: entier(quantites[index]) || 1, prixUnitaire: entier(prix[index]) })),
    validiteJours: Number.isInteger(validite) && validite > 0 ? validite : null,
    conditions: String(formData.get("conditions") ?? "").trim() || null,
    actor: user,
  });
  if (!resultat.ok) return { error: resultat.error };
  if (formData.get("envoyer") === "on" && resultat.devisId) {
    const envoi = await envoyerDevisClient({ devisId: resultat.devisId, actor: user });
    if (!envoi.ok) {
      revalidatePath("/", "layout");
      return { error: `Devis créé, mais non envoyé : ${envoi.error}` };
    }
  }
  revalidatePath("/", "layout");
  return null;
}

export async function envoyerDevis(_etat: EtatAction, formData: FormData): Promise<EtatAction> {
  const user = await requireUser();
  if (!peutDevis(user.role)) return { error: "Action non autorisée." };
  const resultat = await envoyerDevisClient({
    devisId: String(formData.get("devisId") ?? ""),
    email: String(formData.get("email") ?? ""),
    actor: user,
  });
  revalidatePath("/", "layout");
  return resultat.ok ? null : { error: resultat.error };
}

export async function deciderDevis(devisId: string, decision: "ACCEPTE" | "REFUSE") {
  const user = await requireUser();
  if (!peutDevis(user.role)) return;
  const devis = await prisma.devis.findUnique({ where: { id: devisId }, include: { dossier: true } });
  if (!devis || devis.statut !== "EMIS") return;
  await prisma.$transaction([
    prisma.devis.update({ where: { id: devis.id }, data: { statut: decision, decideLe: new Date() } }),
    ...(decision === "ACCEPTE" ? [prisma.dossier.update({ where: { id: devis.dossierId }, data: { montantConvenu: devis.total } })] : []),
    prisma.audit.create({
      data: {
        userId: user.id,
        action: "DEVIS",
        entite: "Dossier",
        entiteId: devis.dossierId,
        detail: decision === "ACCEPTE" ? `${devis.numero} accepté · montant convenu ${xof(devis.total)}` : `${devis.numero} refusé`,
      },
    }),
  ]);
  revalidatePath("/", "layout");
}

export async function supprimerDevis(devisId: string) {
  const user = await requireUser();
  if (!peutDevis(user.role)) return;
  const devis = await prisma.devis.findUnique({ where: { id: devisId } });
  if (!devis || devis.statut !== "EMIS") return;
  await prisma.devis.delete({ where: { id: devis.id } });
  await prisma.audit.create({ data: { userId: user.id, action: "DEVIS", entite: "Dossier", entiteId: devis.dossierId, detail: `${devis.numero} supprimé` } });
  revalidatePath("/", "layout");
}
