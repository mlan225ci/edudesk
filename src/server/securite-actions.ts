"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { ROLES } from "@/lib/labels";
import { enregistrerRolesDoubleAuth } from "@/server/deux-facteurs";
import { peutParametrer } from "@/server/permissions";
import { requireUser } from "@/server/session";
import type { EtatAction } from "@/server/actions";

function journaliser(userId: string, detail: string) {
  return prisma.audit.create({ data: { userId, action: "PARAMETRES", entite: "Securite", entiteId: "2fa", detail } });
}

export async function enregistrerDoubleAuthRoles(_etat: EtatAction, formData: FormData): Promise<EtatAction> {
  const user = await requireUser();
  if (!peutParametrer(user)) return { error: "Réservé à la direction." };
  const coches = new Set(formData.getAll("roles").map(String));
  const roles = ROLES.map((item) => item.value).filter((role) => coches.has(role));
  await enregistrerRolesDoubleAuth(roles);
  await journaliser(user.id, roles.length ? `Double authentification pour : ${roles.join(", ")}` : "Double authentification désactivée pour tous les rôles");
  revalidatePath("/parametres", "layout");
  return null;
}

export async function enregistrerDoubleAuthCompte(_etat: EtatAction, formData: FormData): Promise<EtatAction> {
  const user = await requireUser();
  if (!peutParametrer(user)) return { error: "Réservé à la direction." };
  const compteId = String(formData.get("compte") ?? "");
  const choix = String(formData.get("doubleAuth") ?? "role");
  const compte = await prisma.user.findUnique({ where: { id: compteId }, select: { id: true, prenom: true, nom: true, role: true } });
  if (!compte) return { error: "Compte introuvable." };
  const doubleAuth = choix === "oui" ? true : choix === "non" ? false : null;
  await prisma.user.update({ where: { id: compte.id }, data: { doubleAuth } });
  const detail =
    doubleAuth === true
      ? `Double authentification imposée à ${compte.prenom} ${compte.nom}`
      : doubleAuth === false
        ? `Double authentification retirée pour ${compte.prenom} ${compte.nom}`
        : `${compte.prenom} ${compte.nom} suit de nouveau le réglage de son rôle`;
  await journaliser(user.id, detail);
  revalidatePath("/parametres", "layout");
  return null;
}

export async function retablirDoubleAuthRoles(_etat: EtatAction, _formData: FormData): Promise<EtatAction> {
  const user = await requireUser();
  if (!peutParametrer(user)) return { error: "Réservé à la direction." };
  await prisma.parametre.deleteMany({ where: { cle: { startsWith: "2fa.role." } } });
  await journaliser(user.id, "Double authentification : retour aux rôles d'origine (Direction et Administrateur)");
  revalidatePath("/parametres", "layout");
  return null;
}
