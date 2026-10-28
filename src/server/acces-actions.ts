"use server";

import { revalidatePath } from "next/cache";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ROLES } from "@/lib/labels";
import type { EtatAction } from "@/server/actions";
import { ACCES, accesParDefaut, estAccesId, lireReglageRole, type AccesId } from "@/server/acces";
import { peutParametrer } from "@/server/permissions";
import { requireUser } from "@/server/session";

function coches(formData: FormData) {
  return new Set(formData.getAll("acces").map(String).filter(estAccesId));
}

function roleValide(valeur: string): valeur is Role {
  return ROLES.some((role) => role.value === valeur);
}

async function journaliser(userId: string, detail: string) {
  await prisma.audit.create({ data: { userId, action: "PARAMETRES", entite: "Acces", entiteId: "acces", detail } });
  revalidatePath("/", "layout");
}

export async function enregistrerAccesRole(_etat: EtatAction, formData: FormData): Promise<EtatAction> {
  const user = await requireUser();
  if (!peutParametrer(user.role)) return { error: "Réservé à la direction et à l'administrateur." };
  const role = String(formData.get("role") ?? "");
  if (!roleValide(role)) return { error: "Rôle inconnu." };
  const choisi = coches(formData);
  const defaut = accesParDefaut(role);
  await prisma.$transaction(async (tx) => {
    await tx.accesRole.deleteMany({ where: { role } });
    const lignes = ACCES.filter((acces) => choisi.has(acces.id) !== defaut[acces.id]).map((acces) => ({
      role,
      cle: acces.id,
      autorise: choisi.has(acces.id),
    }));
    if (lignes.length) await tx.accesRole.createMany({ data: lignes });
  });
  const ajoutes = ACCES.filter((acces) => choisi.has(acces.id) && !defaut[acces.id]).map((acces) => acces.label);
  const retires = ACCES.filter((acces) => !choisi.has(acces.id) && defaut[acces.id]).map((acces) => acces.label);
  const morceaux = [ajoutes.length ? `ajoutés ${ajoutes.join(", ")}` : "", retires.length ? `retirés ${retires.join(", ")}` : ""].filter(Boolean);
  await journaliser(user.id, morceaux.length ? `Accès du rôle ${role} : ${morceaux.join(" ; ")}` : `Accès du rôle ${role} inchangés par rapport aux droits d'origine`);
  return null;
}

export async function retablirAccesRole(_etat: EtatAction, formData: FormData): Promise<EtatAction> {
  const user = await requireUser();
  if (!peutParametrer(user.role)) return { error: "Réservé à la direction et à l'administrateur." };
  const role = String(formData.get("role") ?? "");
  if (!roleValide(role)) return { error: "Rôle inconnu." };
  await prisma.accesRole.deleteMany({ where: { role } });
  await journaliser(user.id, `Accès du rôle ${role} revenus aux droits d'origine`);
  return null;
}

export async function enregistrerAccesCompte(_etat: EtatAction, formData: FormData): Promise<EtatAction> {
  const user = await requireUser();
  if (!peutParametrer(user.role)) return { error: "Réservé à la direction et à l'administrateur." };
  const userId = String(formData.get("compte") ?? "");
  const cible = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true, prenom: true, nom: true } });
  if (!cible) return { error: "Compte introuvable." };
  const choisi = coches(formData);
  const duRole = await lireReglageRole(cible.role);
  await prisma.$transaction(async (tx) => {
    await tx.accesCompte.deleteMany({ where: { userId } });
    const lignes = ACCES.filter((acces) => choisi.has(acces.id) !== duRole[acces.id]).map((acces) => ({
      userId,
      cle: acces.id as AccesId,
      autorise: choisi.has(acces.id),
    }));
    if (lignes.length) await tx.accesCompte.createMany({ data: lignes });
  });
  await journaliser(user.id, `Accès personnalisés pour ${cible.prenom} ${cible.nom}`);
  return null;
}

export async function retablirAccesCompte(_etat: EtatAction, formData: FormData): Promise<EtatAction> {
  const user = await requireUser();
  if (!peutParametrer(user.role)) return { error: "Réservé à la direction et à l'administrateur." };
  const userId = String(formData.get("compte") ?? "");
  const cible = await prisma.user.findUnique({ where: { id: userId }, select: { prenom: true, nom: true } });
  if (!cible) return { error: "Compte introuvable." };
  await prisma.accesCompte.deleteMany({ where: { userId } });
  await journaliser(user.id, `Accès de ${cible.prenom} ${cible.nom} repris sur son rôle`);
  return null;
}
