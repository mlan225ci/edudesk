"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { compterSegments, normaliserTelephone, telephoneValide } from "@/lib/format";
import type { EtatAction } from "@/server/actions";
import { CHAMPS_ENTREPRISE, configSms, ecrireParametres } from "@/server/parametres";
import { peutParametrer, voitDirection } from "@/server/permissions";
import { requireUser } from "@/server/session";
import { envoyerSms } from "@/server/sms";

function texte(formData: FormData, champ: string) {
  return String(formData.get(champ) ?? "").trim();
}

function adresseWeb(valeur: string) {
  if (!valeur) return "";
  return /^https?:\/\//i.test(valeur) ? valeur.replace(/\/+$/, "") : `https://${valeur.replace(/\/+$/, "")}`;
}

async function journaliser(userId: string, detail: string) {
  await prisma.audit.create({ data: { userId, action: "PARAMETRES", entite: "Parametre", entiteId: "application", detail } });
  revalidatePath("/", "layout");
}

export async function modifierEntreprise(_etat: EtatAction, formData: FormData): Promise<EtatAction> {
  const user = await requireUser();
  if (!peutParametrer(user.role)) return { error: "Réservé à la direction." };
  const valeurs = Object.fromEntries(CHAMPS_ENTREPRISE.map((champ) => [champ, texte(formData, champ)]));
  if (!valeurs.nom) return { error: "Indiquez le nom de l'entreprise." };
  if (valeurs.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valeurs.email)) return { error: "L'adresse e-mail n'est pas valide." };
  valeurs.siteWeb = adresseWeb(valeurs.siteWeb);
  await ecrireParametres("entreprise", valeurs);
  await journaliser(user.id, "Identité de l'entreprise mise à jour");
  return null;
}

export async function modifierApplication(_etat: EtatAction, formData: FormData): Promise<EtatAction> {
  const user = await requireUser();
  if (!peutParametrer(user.role)) return { error: "Réservé à la direction." };
  const url = texte(formData, "urlPublique");
  if (url && !/^https?:\/\/[^\s/]+/i.test(url)) return { error: "L'adresse doit commencer par https:// (ou http://)." };
  await ecrireParametres("application", { urlPublique: url ? url.replace(/\/+$/, "") : null });
  await journaliser(user.id, url ? `Adresse publique : ${url}` : "Adresse publique retirée");
  return null;
}

export async function modifierOperateurSms(_etat: EtatAction, formData: FormData): Promise<EtatAction> {
  const user = await requireUser();
  if (!peutParametrer(user.role)) return { error: "Réservé à la direction." };
  const url = texte(formData, "url");
  const token = texte(formData, "token");
  const expediteur = texte(formData, "expediteur");
  if (url && !/^https?:\/\/[^\s/]+/i.test(url)) return { error: "L'adresse de l'opérateur doit commencer par https://." };
  if (expediteur && !/^[A-Za-z0-9 ]{1,11}$/.test(expediteur)) return { error: "Le nom d'expéditeur fait 11 caractères au plus, lettres et chiffres uniquement." };
  await ecrireParametres("sms", {
    url: url || null,
    expediteur: expediteur || null,
    ...(formData.get("effacerToken") === "on" || !url ? { token: null } : token ? { token } : {}),
  });
  await journaliser(user.id, url ? "Opérateur SMS configuré" : "Opérateur SMS débranché");
  return null;
}

export async function envoyerSmsTest(_etat: EtatAction, formData: FormData): Promise<EtatAction> {
  const user = await requireUser();
  if (!voitDirection(user.role)) return { error: "Réservé à la direction." };
  const telephone = normaliserTelephone(texte(formData, "telephone"));
  if (!telephoneValide(telephone)) return { error: "Numéro international invalide, par exemple +2250700000000." };
  const config = await configSms();
  const message = `Test EduDesk : votre opérateur SMS fonctionne (${config.expediteur}).`;
  const ligne = await prisma.notificationSms.create({
    data: { telephone, type: "DIRECTION", texte: message, segments: compterSegments(message) },
  });
  try {
    const resultat = await envoyerSms(telephone, message);
    await prisma.notificationSms.update({ where: { id: ligne.id }, data: { statut: resultat.statut, fournisseurId: resultat.fournisseurId, envoyeLe: new Date() } });
    revalidatePath("/", "layout");
    if (resultat.statut === "JOURNAL") return { error: "Aucun opérateur branché : le SMS a seulement été inscrit au journal." };
    return null;
  } catch (erreur) {
    const detail = erreur instanceof Error ? erreur.message : "Erreur inconnue";
    await prisma.notificationSms.update({ where: { id: ligne.id }, data: { statut: "ECHEC", erreur: detail } });
    revalidatePath("/", "layout");
    return { error: `L'opérateur a refusé l'envoi : ${detail}.` };
  }
}
