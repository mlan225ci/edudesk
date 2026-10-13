export function nomComplet(personne: { prenom: string; nom: string }) {
  return `${personne.prenom} ${personne.nom}`.trim();
}

export function xof(montant: number) {
  return `${new Intl.NumberFormat("fr-FR").format(montant)} F CFA`;
}

export function formatDate(date: Date | null | undefined) {
  if (!date) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Abidjan",
  }).format(date);
}

export function formatJour(date: Date | null | undefined) {
  if (!date) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeZone: "Africa/Abidjan",
  }).format(date);
}

export function delaiTexte(limite: Date | null | undefined) {
  if (!limite) return "Sans délai";
  const heures = Math.round((limite.getTime() - Date.now()) / 36e5);
  if (heures < 0) return `Retard de ${Math.abs(heures)} h`;
  if (heures < 48) return `${heures} h restantes`;
  return `${Math.round(heures / 24)} j restants`;
}

export function delaiCourt(heures: number | null | undefined) {
  if (heures == null) return "sans delai";
  if (heures < 48) return `${heures} h`;
  return `${Math.round(heures / 24)} j`;
}

export function ajouterHeures(depuis: Date, heures: number | null) {
  if (heures == null) return null;
  return new Date(depuis.getTime() + heures * 36e5);
}

export function telephoneValide(valeur: string) {
  return /^\+[1-9]\d{7,14}$/.test(valeur.replace(/\s/g, ""));
}

export function normaliserTelephone(valeur: string) {
  return valeur.replace(/\s/g, "");
}

const GSM =
  /^[@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&'()*+,\-./0-9:;<=>?¡A-ZÄÖÑÜ§¿a-zäöñüà^{}\\\[~\]|€]*$/u;

export function compterSegments(texte: string) {
  const gsm = GSM.test(texte);
  const simple = gsm ? 160 : 70;
  const multi = gsm ? 153 : 67;
  if (texte.length <= simple) return 1;
  return Math.ceil(texte.length / multi);
}

export function rendreModele(corps: string, variables: Record<string, string>) {
  return corps.replace(/\{\{(\w+)\}\}/g, (_, cle: string) => variables[cle] ?? "");
}

export function debutJourAbidjan(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Abidjan",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  return new Date(`${parts}T00:00:00.000Z`);
}

export function debutMois(decalage = 0, date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + decalage, 1));
}

export function moisDepuisCle(cle: string | undefined) {
  const trouve = /^(\d{4})-(\d{2})$/.exec(cle ?? "");
  if (!trouve) return debutMois();
  return new Date(Date.UTC(Number(trouve[1]), Number(trouve[2]) - 1, 1));
}

export function cleMois(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function labelMois(date: Date, long = false) {
  return new Intl.DateTimeFormat("fr-FR", {
    month: long ? "long" : "short",
    year: long ? "numeric" : undefined,
    timeZone: "UTC",
  }).format(date);
}

export function xofCourt(montant: number) {
  const absolu = Math.abs(montant);
  if (absolu >= 1e9) return `${(montant / 1e9).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Md`;
  if (absolu >= 1e6) return `${(montant / 1e6).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} M`;
  if (absolu >= 1e3) return `${Math.round(montant / 1e3).toLocaleString("fr-FR")} k`;
  return montant.toLocaleString("fr-FR");
}

export function variation(actuel: number, precedent: number) {
  if (precedent === 0) return actuel === 0 ? 0 : null;
  return Math.round(((actuel - precedent) / Math.abs(precedent)) * 100);
}
