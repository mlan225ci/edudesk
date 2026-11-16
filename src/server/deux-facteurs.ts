import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { cache } from "react";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ROLES } from "@/lib/labels";
import { envoyerMailDirect } from "@/server/mail";
import { ecrireParametres } from "@/server/parametres";
import { rolesEffectifs } from "@/server/permissions";
import { fermerAttenteCode, lireAttenteCode, ouvrirAttenteCode } from "@/server/session";

const DUREE_CODE = 10 * 60 * 1000;
const PAUSE_RENVOI = 60 * 1000;
const ESSAIS_MAX = 5;
const PREFIXE = "2fa.role.";

/** Rôles protégés tant qu'aucun réglage n'a été enregistré. */
export const ROLES_2FA_DEFAUT = new Set<Role>(["CEO", "ADMINISTRATEUR"]);

function empreinte(code: string) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET manquant");
  return createHash("sha256").update(`${secret}:${code}`).digest();
}

function codesEgaux(hashHex: string, code: string) {
  const attendu = Buffer.from(hashHex, "hex");
  const recu = empreinte(code);
  return attendu.length === recu.length && timingSafeEqual(attendu, recu);
}

async function effacerCode(userId: string) {
  await prisma.user.update({
    where: { id: userId },
    data: { codeConnexionHash: null, codeConnexionExpire: null, codeConnexionEnvoie: null, codeConnexionEssais: 0 },
  });
}

async function envoyerNouveauCode(user: { id: string; email: string; prenom: string }, conserverEssais: number) {
  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  const maintenant = new Date();
  await prisma.user.update({
    where: { id: user.id },
    data: {
      codeConnexionHash: empreinte(code).toString("hex"),
      codeConnexionExpire: new Date(maintenant.getTime() + DUREE_CODE),
      codeConnexionEnvoie: maintenant,
      codeConnexionEssais: conserverEssais,
    },
  });
  try {
    const resultat = await envoyerMailDirect({
      a: user.email,
      sujet: "Votre code de connexion EduDesk",
      corps: `Bonjour ${user.prenom},\n\nPour terminer votre connexion, saisissez ce code :\n\n${code}\n\nCe code est valable 10 minutes. Ne le communiquez à personne.\n\nSi vous n'avez pas demandé à vous connecter, ignorez cet e-mail.`,
      code,
    });
    if (resultat.statut !== "ENVOYE") {
      await effacerCode(user.id);
      return { ok: "direct" as const };
    }
    return { ok: "code" as const };
  } catch (error) {
    await effacerCode(user.id);
    console.error("[2FA] envoi impossible", error instanceof Error ? error.message : "erreur");
    return { error: "Le code n'a pas pu être envoyé. Réessayez dans un instant." };
  }
}

export const lireRolesDoubleAuth = cache(async function lireRolesDoubleAuth(): Promise<Record<Role, boolean>> {
  const lignes = await prisma.parametre.findMany({ where: { cle: { startsWith: PREFIXE } } });
  const valeurs = new Map(lignes.map((ligne) => [ligne.cle.slice(PREFIXE.length), ligne.valeur]));
  return Object.fromEntries(
    ROLES.map(({ value }) => {
      const enregistre = valeurs.get(value);
      return [value, enregistre === undefined ? ROLES_2FA_DEFAUT.has(value) : enregistre === "1"];
    }),
  ) as Record<Role, boolean>;
});

export async function exigeDoubleAuth(user: { role: Role; autresRoles?: Role[] | null; doubleAuth: boolean | null }) {
  if (user.doubleAuth !== null) return user.doubleAuth;
  const roles = await lireRolesDoubleAuth();
  return rolesEffectifs(user).some((role) => roles[role]);
}

export async function enregistrerRolesDoubleAuth(roles: Iterable<Role>) {
  const coches = new Set(roles);
  await ecrireParametres(
    "2fa.role",
    Object.fromEntries(ROLES.map(({ value }) => [value, coches.has(value) ? "1" : "0"])),
  );
}

export async function demarrerVerification(
  user: { id: string; email: string; prenom: string; codeConnexionEnvoie: Date | null; codeConnexionExpire: Date | null },
  souvenir: boolean,
) {
  const recent =
    user.codeConnexionEnvoie &&
    user.codeConnexionExpire &&
    user.codeConnexionExpire > new Date() &&
    Date.now() - user.codeConnexionEnvoie.getTime() < PAUSE_RENVOI;
  if (!recent) {
    const envoi = await envoyerNouveauCode(user, 0);
    if ("error" in envoi) return envoi;
    if (envoi.ok === "direct") return { ok: "direct" as const };
  }
  await ouvrirAttenteCode(user.id, souvenir);
  return { ok: "code" as const };
}

export async function verifierCodeConnexion(saisi: string): Promise<{ error: string } | { userId: string; souvenir: boolean; role: Role }> {
  const attente = await lireAttenteCode();
  if (!attente) return { error: "La demande a expiré. Reconnectez-vous." };
  const code = saisi.replace(/\s/g, "");
  if (!/^\d{6}$/.test(code)) return { error: "Saisissez les 6 chiffres reçus par e-mail." };
  const user = await prisma.user.findUnique({ where: { id: attente.userId } });
  if (!user?.actif) {
    await fermerAttenteCode();
    return { error: "Compte désactivé." };
  }
  if (user.verrouilleJusquau && user.verrouilleJusquau > new Date()) {
    await fermerAttenteCode();
    return { error: "Compte verrouillé après plusieurs échecs. Réessayez dans 15 minutes." };
  }
  if (!user.codeConnexionHash || !user.codeConnexionExpire || user.codeConnexionExpire < new Date()) {
    return { error: "Ce code a expiré. Demandez-en un nouveau." };
  }
  if (!codesEgaux(user.codeConnexionHash, code)) {
    const essais = user.codeConnexionEssais + 1;
    if (essais >= ESSAIS_MAX) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          codeConnexionEssais: 0,
          codeConnexionHash: null,
          codeConnexionExpire: null,
          codeConnexionEnvoie: null,
          verrouilleJusquau: new Date(Date.now() + 15 * 60 * 1000),
        },
      });
      await fermerAttenteCode();
      return { error: "Compte verrouillé après plusieurs codes incorrects. Réessayez dans 15 minutes." };
    }
    await prisma.user.update({ where: { id: user.id }, data: { codeConnexionEssais: essais } });
    return { error: "Code incorrect." };
  }
  await effacerCode(user.id);
  return { userId: user.id, souvenir: attente.souvenir, role: user.role };
}

export async function renvoyerCodeConnexion() {
  const attente = await lireAttenteCode();
  if (!attente) return { error: "La demande a expiré. Reconnectez-vous." };
  const user = await prisma.user.findUnique({ where: { id: attente.userId } });
  if (!user?.actif) {
    await fermerAttenteCode();
    return { error: "Compte désactivé." };
  }
  if (user.verrouilleJusquau && user.verrouilleJusquau > new Date()) {
    await fermerAttenteCode();
    return { error: "Compte verrouillé après plusieurs échecs. Réessayez dans 15 minutes." };
  }
  if (user.codeConnexionEssais >= ESSAIS_MAX) return { error: "Trop de tentatives. Reconnectez-vous." };
  if (user.codeConnexionEnvoie && Date.now() - user.codeConnexionEnvoie.getTime() < PAUSE_RENVOI) {
    return { error: "Attendez une minute avant de renvoyer le code." };
  }
  const envoi = await envoyerNouveauCode(user, user.codeConnexionEssais);
  if ("error" in envoi) return envoi;
  if (envoi.ok === "direct") return { error: "Le serveur e-mail n'est pas configuré." };
  await ouvrirAttenteCode(user.id, attente.souvenir);
  return { ok: true };
}

export function masquerEmail(email: string) {
  const [nom, domaine] = email.split("@");
  if (!nom || !domaine) return email;
  return `${nom.slice(0, 1)}${"•".repeat(Math.max(2, nom.length - 1))}@${domaine}`;
}
