import { readFile } from "node:fs/promises";
import path from "node:path";
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
};

export const TAILLES_LOGO = { petit: "Petit", moyen: "Moyen", grand: "Grand" } as const;

export type ParametresDocuments = {
  /** Vide : logo EduDesk ; « aucun » : nom de l'entreprise en texte ; sinon fichier importé dans storage/parametres. */
  logo: string;
  tailleLogo: keyof typeof TAILLES_LOGO;
  couleurPrincipale: string;
  couleurAccent: string;
  afficherCoordonnees: boolean;
  validiteDevis: number;
  echeanceFacture: number;
  conditionsDevis: string;
  conditionsFacture: string;
  modalitesPaiement: string;
  afficherSignatures: boolean;
  signataire: string;
  piedDevis: string;
  piedFacture: string;
  piedCommun: string;
  afficherMentionsLegales: boolean;
};

export const DOCUMENTS_DEFAUT: ParametresDocuments = {
  logo: "",
  tailleLogo: "moyen",
  couleurPrincipale: "#14284b",
  couleurAccent: "#f2b705",
  afficherCoordonnees: true,
  validiteDevis: 30,
  echeanceFacture: 15,
  conditionsDevis: "Acompte de 50 % à la signature du contrat, solde avant le dépôt du dossier.",
  conditionsFacture: "",
  modalitesPaiement: "Règlement en espèces à l'agence, par Mobile Money (Orange Money, MTN, Moov, Wave) ou par virement bancaire.",
  afficherSignatures: true,
  signataire: "",
  piedDevis: "Ce document n'a pas valeur de facture.",
  piedFacture: "Merci de votre confiance.",
  piedCommun: "",
  afficherMentionsLegales: true,
};

export const REPERTOIRE_PARAMETRES = path.join(process.cwd(), "storage", "parametres");
const LOGO_DEFAUT = path.join(process.cwd(), "public", "logo-pdf.png");

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

function nombre(valeur: string | undefined, defaut: number) {
  const n = Number(valeur);
  return valeur && Number.isInteger(n) && n >= 0 ? n : defaut;
}

export async function lireDocuments(): Promise<ParametresDocuments> {
  const [valeurs, entreprise] = await Promise.all([lire("documents"), lire("entreprise")]);
  const d = DOCUMENTS_DEFAUT;
  const texte = (cle: keyof ParametresDocuments, ancien?: string) => valeurs.get(cle) ?? (ancien ? entreprise.get(ancien) : undefined) ?? (d[cle] as string);
  const oui = (cle: keyof ParametresDocuments) => (valeurs.has(cle) ? valeurs.get(cle) === "1" : (d[cle] as boolean));
  const taille = valeurs.get("tailleLogo");
  return {
    logo: valeurs.get("logo") ?? d.logo,
    tailleLogo: taille && taille in TAILLES_LOGO ? (taille as ParametresDocuments["tailleLogo"]) : d.tailleLogo,
    couleurPrincipale: texte("couleurPrincipale"),
    couleurAccent: texte("couleurAccent"),
    afficherCoordonnees: oui("afficherCoordonnees"),
    validiteDevis: nombre(valeurs.get("validiteDevis"), d.validiteDevis),
    echeanceFacture: nombre(valeurs.get("echeanceFacture"), d.echeanceFacture),
    conditionsDevis: texte("conditionsDevis"),
    conditionsFacture: texte("conditionsFacture"),
    modalitesPaiement: texte("modalitesPaiement", "modalitesPaiement"),
    afficherSignatures: oui("afficherSignatures"),
    signataire: texte("signataire"),
    piedDevis: texte("piedDevis"),
    piedFacture: texte("piedFacture", "mentionFacture"),
    piedCommun: texte("piedCommun"),
    afficherMentionsLegales: oui("afficherMentionsLegales"),
  };
}

/** Logo imprimé sur les devis et factures, ou null quand l'entreprise a choisi de ne pas en mettre. */
export async function logoDocuments(reglages?: ParametresDocuments): Promise<{ octets: Buffer; type: "png" | "jpg" } | null> {
  const { logo } = reglages ?? (await lireDocuments());
  if (logo === "aucun") return null;
  const chemin = logo ? path.join(REPERTOIRE_PARAMETRES, path.basename(logo)) : LOGO_DEFAUT;
  const octets = await readFile(chemin).catch(() => (logo ? readFile(LOGO_DEFAUT).catch(() => null) : null));
  if (!octets) return null;
  return { octets, type: octets[0] === 0xff && octets[1] === 0xd8 ? "jpg" : "png" };
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
