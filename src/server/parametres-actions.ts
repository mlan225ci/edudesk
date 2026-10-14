"use server";

import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";
import sharp from "sharp";
import { prisma } from "@/lib/db";
import { compterSegments, normaliserTelephone, telephoneValide } from "@/lib/format";
import type { EtatAction } from "@/server/actions";
import { executerAutomatisation } from "@/server/automatisation";
import { emailValide, envoyerMailDirect } from "@/server/mail";
import { CHAMPS_ENTREPRISE, REPERTOIRE_PARAMETRES, TAILLES_LOGO, configSms, ecrireParametres, lireDocuments, lireEntreprise } from "@/server/parametres";
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

function bloc(formData: FormData, champ: string) {
  return String(formData.get(champ) ?? "").replace(/\r/g, "").trim();
}

export async function modifierDocuments(_etat: EtatAction, formData: FormData): Promise<EtatAction> {
  const user = await requireUser();
  if (!peutParametrer(user.role)) return { error: "Réservé à la direction." };
  const couleurPrincipale = texte(formData, "couleurPrincipale").toLowerCase();
  const couleurAccent = texte(formData, "couleurAccent").toLowerCase();
  if (![couleurPrincipale, couleurAccent].every((couleur) => /^#[0-9a-f]{6}$/.test(couleur))) return { error: "Choisissez des couleurs valides." };
  const tailleLogo = texte(formData, "tailleLogo");
  if (!(tailleLogo in TAILLES_LOGO)) return { error: "Taille de logo invalide." };
  const validiteDevis = Number(texte(formData, "validiteDevis"));
  const echeanceFacture = Number(texte(formData, "echeanceFacture"));
  if (!Number.isInteger(validiteDevis) || validiteDevis < 1 || validiteDevis > 365) return { error: "La validité des devis doit être comprise entre 1 et 365 jours." };
  if (!Number.isInteger(echeanceFacture) || echeanceFacture < 0 || echeanceFacture > 365) return { error: "Le délai de paiement doit être compris entre 0 et 365 jours." };
  const coche = (champ: string) => (formData.get(champ) === "on" ? "1" : "0");
  await ecrireParametres("documents", {
    tailleLogo,
    couleurPrincipale,
    couleurAccent,
    afficherCoordonnees: coche("afficherCoordonnees"),
    validiteDevis: String(validiteDevis),
    echeanceFacture: String(echeanceFacture),
    conditionsDevis: bloc(formData, "conditionsDevis"),
    conditionsFacture: bloc(formData, "conditionsFacture"),
    modalitesPaiement: bloc(formData, "modalitesPaiement"),
    afficherSignatures: coche("afficherSignatures"),
    signataire: texte(formData, "signataire"),
    piedDevis: texte(formData, "piedDevis"),
    piedFacture: texte(formData, "piedFacture"),
    piedCommun: texte(formData, "piedCommun"),
    afficherMentionsLegales: coche("afficherMentionsLegales"),
  });
  await journaliser(user.id, "Présentation des devis et factures mise à jour");
  return null;
}

async function supprimerAncienLogo(nouveau: string) {
  const { logo } = await lireDocuments();
  if (logo && logo !== "aucun" && logo !== nouveau) await unlink(path.join(REPERTOIRE_PARAMETRES, path.basename(logo))).catch(() => undefined);
}

export async function importerLogoDocuments(_etat: EtatAction, formData: FormData): Promise<EtatAction> {
  const user = await requireUser();
  if (!peutParametrer(user.role)) return { error: "Réservé à la direction." };
  const fichier = formData.get("logo");
  if (!(fichier instanceof File) || fichier.size === 0) return { error: "Choisissez une image." };
  if (fichier.size > 8 * 1024 * 1024) return { error: "L'image dépasse 8 Mo." };
  let octets: Buffer;
  try {
    octets = await sharp(Buffer.from(await fichier.arrayBuffer()))
      .trim({ threshold: 4 })
      .resize({ width: 900, height: 360, fit: "inside", withoutEnlargement: true })
      .png({ compressionLevel: 9, palette: true, quality: 90 })
      .toBuffer();
  } catch {
    return { error: "Image illisible : utilisez un fichier PNG, JPEG, WebP ou SVG." };
  }
  await mkdir(REPERTOIRE_PARAMETRES, { recursive: true });
  const nom = `logo-documents-${Date.now()}.png`;
  await writeFile(path.join(REPERTOIRE_PARAMETRES, nom), octets);
  await supprimerAncienLogo(nom);
  await ecrireParametres("documents", { logo: nom });
  await journaliser(user.id, "Nouveau logo des devis et factures");
  return null;
}

export async function choisirLogoDocuments(formData: FormData) {
  const user = await requireUser();
  if (!peutParametrer(user.role)) return;
  const choix = String(formData.get("choix") ?? "");
  if (choix !== "defaut" && choix !== "aucun") return;
  await supprimerAncienLogo("");
  await ecrireParametres("documents", { logo: choix === "aucun" ? "aucun" : null });
  await journaliser(user.id, choix === "aucun" ? "Logo retiré des devis et factures" : "Logo EduDesk rétabli sur les devis et factures");
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
