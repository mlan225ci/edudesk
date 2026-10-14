"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { compterSegments, normaliserTelephone, telephoneValide } from "@/lib/format";
import type { EtatAction } from "@/server/actions";
import { executerAutomatisation } from "@/server/automatisation";
import { emailValide, envoyerMailDirect } from "@/server/mail";
import { CHAMPS_ENTREPRISE, configSms, ecrireParametres, lireEntreprise } from "@/server/parametres";
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

export async function modifierServeurMail(_etat: EtatAction, formData: FormData): Promise<EtatAction> {
  const user = await requireUser();
  if (!peutParametrer(user.role)) return { error: "Réservé à la direction." };
  const hote = texte(formData, "hote");
  const port = texte(formData, "port") || "587";
  const utilisateur = texte(formData, "utilisateur");
  const motDePasse = texte(formData, "motDePasse");
  const expediteur = texte(formData, "expediteur");
  const nomExpediteur = texte(formData, "nomExpediteur");
  if (hote && !/^[a-z0-9.-]+$/i.test(hote)) return { error: "Le serveur SMTP s'écrit comme smtp.exemple.com." };
  if (!/^\d{2,5}$/.test(port)) return { error: "Le port est un nombre (587, 465 ou 25)." };
  if (expediteur && !emailValide(expediteur)) return { error: "L'adresse d'expédition n'est pas valide." };
  if (hote && !expediteur && !emailValide(utilisateur)) return { error: "Indiquez l'adresse e-mail d'expédition." };
  await ecrireParametres("mail", {
    hote: hote || null,
    port: hote ? port : null,
    securise: hote && formData.get("securise") === "on" ? "1" : null,
    utilisateur: hote ? utilisateur || null : null,
    expediteur: hote ? expediteur || null : null,
    nomExpediteur: nomExpediteur || null,
    ...(formData.get("effacerMotDePasse") === "on" || !hote ? { motDePasse: null } : motDePasse ? { motDePasse } : {}),
  });
  await journaliser(user.id, hote ? `Serveur e-mail configuré (${hote})` : "Serveur e-mail débranché");
  return null;
}

export async function envoyerMailTest(_etat: EtatAction, formData: FormData): Promise<EtatAction> {
  const user = await requireUser();
  if (!voitDirection(user.role)) return { error: "Réservé à la direction." };
  const destinataire = texte(formData, "email");
  if (!emailValide(destinataire)) return { error: "Adresse e-mail invalide." };
  const entreprise = await lireEntreprise();
  const sujet = `Test ${entreprise.nom} : l'envoi d'e-mails fonctionne`;
  const corps = `Bonjour ${user.prenom},\n\nCe message confirme que le serveur d'envoi d'e-mails de ${entreprise.nom} est correctement configuré.\n\nCordialement,\nL'équipe ${entreprise.nom}`;
  const ligne = await prisma.notificationMail.create({ data: { destinataire, type: "DIRECTION", sujet, corps } });
  try {
    const resultat = await envoyerMailDirect({ a: destinataire, sujet, corps });
    await prisma.notificationMail.update({ where: { id: ligne.id }, data: { statut: resultat.statut, envoyeLe: new Date() } });
    revalidatePath("/", "layout");
    if (resultat.statut === "JOURNAL") return { error: "Aucun serveur e-mail branché : le message a seulement été inscrit au journal." };
    return null;
  } catch (erreur) {
    const detail = erreur instanceof Error ? erreur.message : "Erreur inconnue";
    await prisma.notificationMail.update({ where: { id: ligne.id }, data: { statut: "ECHEC", erreur: detail.slice(0, 500) } });
    revalidatePath("/", "layout");
    return { error: `Le serveur a refusé l'envoi : ${detail}.` };
  }
}

export async function modifierAutomatisation(_etat: EtatAction, formData: FormData): Promise<EtatAction> {
  const user = await requireUser();
  if (!peutParametrer(user.role)) return { error: "Réservé à la direction." };
  const minutes = Number(texte(formData, "minutes"));
  if (![5, 15, 30, 60, 120].includes(minutes)) return { error: "Fréquence invalide." };
  const actif = formData.get("actif") === "on";
  await ecrireParametres("automatisation", { actif: actif ? null : "0", minutes: String(minutes) });
  await journaliser(user.id, actif ? `Alertes automatiques toutes les ${minutes} min` : "Alertes automatiques suspendues");
  return null;
}

export async function lancerAutomatisation() {
  const user = await requireUser();
  if (!voitDirection(user.role)) return;
  await executerAutomatisation("manuel", true);
  revalidatePath("/", "layout");
}

export async function modifierModeleMail(_etat: EtatAction, formData: FormData): Promise<EtatAction> {
  const user = await requireUser();
  if (!voitDirection(user.role)) return { error: "Réservé à la direction." };
  const code = texte(formData, "code");
  const sujet = texte(formData, "sujet");
  const corpsMail = String(formData.get("corpsMail") ?? "").replace(/\r/g, "").trim();
  const modele = await prisma.modeleSms.findUnique({ where: { code } });
  if (!modele) return { error: "Modèle introuvable." };
  await prisma.modeleSms.update({ where: { code }, data: { sujet: sujet || null, corpsMail: corpsMail || null } });
  await prisma.audit.create({ data: { userId: user.id, action: "PARAMETRES", entite: "ModeleSms", entiteId: code, detail: `Modèle e-mail « ${modele.libelle} » modifié` } });
  revalidatePath("/", "layout");
  return null;
}
