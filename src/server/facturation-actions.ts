"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ModePaiement, TypePaiement } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { EtatAction } from "@/server/actions";
import { supprimerDevis } from "@/server/devis-actions";
import { annulerFacture, creerFacture, enregistrerPaiement, facturerDevis } from "@/server/engine";
import { peutAnnulerFacture, peutEncaisser, peutFacturer } from "@/server/permissions";
import { requireUser } from "@/server/session";

function entier(valeur: FormDataEntryValue | null) {
  return Number(String(valeur ?? "").replace(/[\s\u00a0\u202f]/g, ""));
}

function jours(valeur: FormDataEntryValue | null) {
  const nombre = entier(valeur);
  return Number.isInteger(nombre) && nombre > 0 ? nombre : null;
}

export async function nouvelleFacture(_etat: EtatAction, formData: FormData): Promise<EtatAction> {
  const user = await requireUser();
  if (!peutFacturer(user.role)) return { error: "La facturation est réservée à la finance et à la direction." };
  const objet = String(formData.get("objet") ?? "").trim();
  if (!objet) return { error: "Indiquez l'objet de la facture." };
  const libelles = formData.getAll("libelle").map((valeur) => String(valeur));
  const quantites = formData.getAll("quantite");
  const prix = formData.getAll("prix");
  const resultat = await creerFacture({
    dossierId: String(formData.get("dossierId") ?? ""),
    objet,
    lignes: libelles.map((libelle, index) => ({ libelle, quantite: entier(quantites[index]) || 1, prixUnitaire: entier(prix[index]) })),
    echeanceJours: jours(formData.get("echeance")),
    conditions: String(formData.get("conditions") ?? "").trim() || null,
    actor: user,
  });
  if (!resultat.ok) return { error: resultat.error };
  revalidatePath("/", "layout");
  return null;
}

export async function transformerDevis(_etat: EtatAction, formData: FormData): Promise<EtatAction> {
  const user = await requireUser();
  if (!peutFacturer(user.role)) return { error: "La facturation est réservée à la finance et à la direction." };
  const resultat = await facturerDevis({ devisId: String(formData.get("devisId") ?? ""), echeanceJours: jours(formData.get("echeance")), actor: user });
  if (!resultat.ok) return { error: resultat.error };
  revalidatePath("/", "layout");
  return null;
}

export async function supprimerDevisEtRevenir(devisId: string) {
  await supprimerDevis(devisId);
  redirect("/facturation");
}

export async function reglerFacture(_etat: EtatAction, formData: FormData): Promise<EtatAction> {
  const user = await requireUser();
  if (!peutEncaisser(user.role)) return { error: "Vous ne pouvez pas enregistrer un encaissement." };
  const facture = await prisma.facture.findUnique({ where: { id: String(formData.get("factureId") ?? "") }, select: { id: true, dossierId: true } });
  if (!facture) return { error: "Facture introuvable." };
  const jour = String(formData.get("date") ?? "");
  const resultat = await enregistrerPaiement({
    dossierId: facture.dossierId,
    factureId: facture.id,
    type: (String(formData.get("type") ?? "") || "FRAIS") as TypePaiement,
    montant: entier(formData.get("montant")),
    mode: String(formData.get("mode") ?? "") as ModePaiement,
    precision: String(formData.get("precision") ?? "").trim(),
    referenceExterne: String(formData.get("referenceExterne") ?? "").trim(),
    dateEncaissement: jour ? new Date(`${jour}T12:00:00.000Z`) : new Date(),
    actor: user,
  });
  if (!resultat.ok) return { error: resultat.error };
  revalidatePath("/", "layout");
  return null;
}

export async function annulerFactureAction(_etat: EtatAction, formData: FormData): Promise<EtatAction> {
  const user = await requireUser();
  if (!peutAnnulerFacture(user.role)) return { error: "L'annulation d'une facture est réservée à la direction et à la comptabilité." };
  const motif = String(formData.get("motif") ?? "").trim();
  if (!motif) return { error: "Indiquez le motif de l'annulation." };
  const resultat = await annulerFacture({ factureId: String(formData.get("factureId") ?? ""), motif, actor: user });
  if (!resultat.ok) return { error: resultat.error };
  revalidatePath("/", "layout");
  return null;
}
