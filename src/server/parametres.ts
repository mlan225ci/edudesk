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
