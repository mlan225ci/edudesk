import { prisma } from "../lib/db";

export const CHAMPS_ENTREPRISE = [
  "nom",
  "slogan",
  "adresse",
  "telephone",
  "email",
  "siteWeb",
  "rccm",
  "ncc",
  "mentionFacture",
  "modalitesPaiement",
] as const;

export type Entreprise = Record<(typeof CHAMPS_ENTREPRISE)[number], string>;

const ENTREPRISE_DEFAUT: Entreprise = {
  nom: "EduDesk",
  slogan: "Bureau d'éducation à l'international",
  adresse: "",
  telephone: "",
  email: "",
  siteWeb: "",
  rccm: "",
  ncc: "",
  mentionFacture: "Merci de votre confiance.",
  modalitesPaiement: "Règlement en espèces à l'agence, par Mobile Money (Orange Money, MTN, Moov, Wave) ou par virement bancaire.",
};

async function lire(prefixe: string) {
  const lignes = await prisma.parametre.findMany({ where: { cle: { startsWith: `${prefixe}.` } } });
  return new Map(lignes.map((ligne) => [ligne.cle.slice(prefixe.length + 1), ligne.valeur]));
}

export async function ecrireParametres(prefixe: string, valeurs: Record<string, string | null>) {
  await prisma.$transaction(
    Object.entries(valeurs).map(([cle, valeur]) =>
      valeur === null
        ? prisma.parametre.deleteMany({ where: { cle: `${prefixe}.${cle}` } })
        : prisma.parametre.upsert({ where: { cle: `${prefixe}.${cle}` }, create: { cle: `${prefixe}.${cle}`, valeur }, update: { valeur } }),
    ),
  );
}

export async function lireEntreprise(): Promise<Entreprise> {
  const valeurs = await lire("entreprise");
  return Object.fromEntries(CHAMPS_ENTREPRISE.map((champ) => [champ, valeurs.get(champ) ?? ENTREPRISE_DEFAUT[champ]])) as Entreprise;
}

export async function urlPublique() {
  const valeurs = await lire("application");
  return valeurs.get("urlPublique") || process.env.URL_PUBLIQUE || null;
}

export type ConfigSms = { url: string | null; token: string | null; expediteur: string; source: "parametres" | "serveur" | "aucune" };

export async function configSms(): Promise<ConfigSms> {
  const valeurs = await lire("sms");
  const expediteur = valeurs.get("expediteur") || process.env.SMS_SENDER || "EDUDESK";
  if (valeurs.get("url")) return { url: valeurs.get("url")!, token: valeurs.get("token") ?? null, expediteur, source: "parametres" };
  if (process.env.SMS_HTTP_URL) return { url: process.env.SMS_HTTP_URL, token: process.env.SMS_HTTP_TOKEN ?? null, expediteur, source: "serveur" };
  return { url: null, token: null, expediteur, source: "aucune" };
}

export type ConfigMail = {
  hote: string | null;
  port: number;
  securise: boolean;
  utilisateur: string | null;
  motDePasse: string | null;
  expediteur: string | null;
  nomExpediteur: string;
  source: "parametres" | "serveur" | "aucune";
};

export async function configMail(): Promise<ConfigMail> {
  const valeurs = await lire("mail");
  const entreprise = await lireEntreprise();
  const nomExpediteur = valeurs.get("nomExpediteur") || entreprise.nom;
  if (valeurs.get("hote")) {
    const port = Number(valeurs.get("port") || 587);
    return {
      hote: valeurs.get("hote")!,
      port,
      securise: valeurs.get("securise") === "1" || port === 465,
      utilisateur: valeurs.get("utilisateur") || null,
      motDePasse: valeurs.get("motDePasse") || null,
      expediteur: valeurs.get("expediteur") || valeurs.get("utilisateur") || entreprise.email || null,
      nomExpediteur,
      source: "parametres",
    };
  }
  if (process.env.SMTP_HOST) {
    const port = Number(process.env.SMTP_PORT || 587);
    return {
      hote: process.env.SMTP_HOST,
      port,
      securise: process.env.SMTP_SECURE === "1" || port === 465,
      utilisateur: process.env.SMTP_USER || null,
      motDePasse: process.env.SMTP_PASSWORD || null,
      expediteur: process.env.SMTP_FROM || process.env.SMTP_USER || entreprise.email || null,
      nomExpediteur,
      source: "serveur",
    };
  }
  return { hote: null, port: 587, securise: false, utilisateur: null, motDePasse: null, expediteur: null, nomExpediteur, source: "aucune" };
}

export async function lireParametre(cle: string) {
  const ligne = await prisma.parametre.findUnique({ where: { cle } });
  return ligne?.valeur ?? null;
}
