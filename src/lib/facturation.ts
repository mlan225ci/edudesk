export type LigneDocument = { libelle: string; quantite: number; prixUnitaire: number };

export function lireLignes(valeur: unknown): LigneDocument[] {
  if (!Array.isArray(valeur)) return [];
  return valeur
    .map((ligne) => ligne as Partial<LigneDocument>)
    .filter((ligne) => typeof ligne.libelle === "string")
    .map((ligne) => ({ libelle: ligne.libelle!, quantite: Number(ligne.quantite) || 1, prixUnitaire: Number(ligne.prixUnitaire) || 0 }));
}

export type TonEtat = "desk" | "edu" | "cap" | "vert" | "gris" | "mission";
export type EtatDocument = { code: string; label: string; ton: TonEtat };

function date(valeur: Date | string | null | undefined) {
  return valeur ? new Date(valeur) : null;
}

export function etatDevis(devis: { statut: "EMIS" | "ACCEPTE" | "REFUSE"; validiteLe: Date | string | null; facture?: { numero: string } | null }, maintenant = new Date()): EtatDocument {
  if (devis.facture) return { code: "FACTURE", label: "Facturé", ton: "desk" };
  if (devis.statut === "ACCEPTE") return { code: "ACCEPTE", label: "Accepté", ton: "vert" };
  if (devis.statut === "REFUSE") return { code: "REFUSE", label: "Refusé", ton: "gris" };
  const validite = date(devis.validiteLe);
  if (validite && validite < maintenant) return { code: "EXPIRE", label: "Expiré", ton: "cap" };
  return { code: "EMIS", label: "En attente", ton: "edu" };
}

export function etatFacture(
  facture: { montant: number; regle: number; annuleeLe: Date | string | null; echeanceLe: Date | string | null },
  maintenant = new Date(),
): EtatDocument {
  if (facture.annuleeLe) return { code: "ANNULEE", label: "Annulée", ton: "gris" };
  if (facture.regle >= facture.montant) return { code: "PAYEE", label: "Payée", ton: "vert" };
  const echeance = date(facture.echeanceLe);
  if (echeance && echeance < maintenant) return { code: "EN_RETARD", label: facture.regle > 0 ? "En retard · partielle" : "En retard", ton: "cap" };
  if (facture.regle > 0) return { code: "PARTIELLE", label: "Partiellement réglée", ton: "mission" };
  return { code: "A_REGLER", label: "À régler", ton: "edu" };
}

export const ETATS_DEVIS = [
  { value: "EMIS", label: "En attente" },
  { value: "ACCEPTE", label: "Accepté" },
  { value: "FACTURE", label: "Facturé" },
  { value: "REFUSE", label: "Refusé" },
  { value: "EXPIRE", label: "Expiré" },
] as const;

export const ETATS_FACTURE = [
  { value: "A_REGLER", label: "À régler" },
  { value: "PARTIELLE", label: "Partiellement réglée" },
  { value: "EN_RETARD", label: "En retard" },
  { value: "PAYEE", label: "Payée" },
  { value: "ANNULEE", label: "Annulée" },
] as const;

const UNITES = [
  "zéro",
  "un",
  "deux",
  "trois",
  "quatre",
  "cinq",
  "six",
  "sept",
  "huit",
  "neuf",
  "dix",
  "onze",
  "douze",
  "treize",
  "quatorze",
  "quinze",
  "seize",
  "dix-sept",
  "dix-huit",
  "dix-neuf",
];
const DIZAINES = ["", "", "vingt", "trente", "quarante", "cinquante", "soixante", "soixante", "quatre-vingt", "quatre-vingt"];

function moinsDeCent(n: number, accord: boolean): string {
  if (n < 20) return UNITES[n];
  const dizaine = Math.floor(n / 10);
  const unite = n % 10;
  if (dizaine === 7 || dizaine === 9) return `${DIZAINES[dizaine]}${dizaine === 7 && unite === 1 ? " et " : "-"}${UNITES[10 + unite]}`;
  if (unite === 0) return dizaine === 8 && accord ? "quatre-vingts" : DIZAINES[dizaine];
  if (unite === 1 && dizaine !== 8) return `${DIZAINES[dizaine]} et un`;
  return `${DIZAINES[dizaine]}-${UNITES[unite]}`;
}

/** `accord` : faux devant « mille », où « cent » et « vingt » restent invariables. */
function moinsDeMille(n: number, accord: boolean): string {
  const centaines = Math.floor(n / 100);
  const reste = n % 100;
  const morceaux: string[] = [];
  if (centaines === 1) morceaux.push("cent");
  else if (centaines > 1) morceaux.push(`${UNITES[centaines]} cent${reste === 0 && accord ? "s" : ""}`);
  if (reste > 0) morceaux.push(moinsDeCent(reste, accord));
  return morceaux.join(" ");
}

/** Écrit un entier positif en toutes lettres, selon l'orthographe traditionnelle. */
export function enLettres(valeur: number): string {
  const n = Math.floor(Math.abs(valeur));
  if (n === 0) return "zéro";
  if (n >= 1e12) return new Intl.NumberFormat("fr-FR").format(n);
  const milliards = Math.floor(n / 1e9);
  const millions = Math.floor(n / 1e6) % 1000;
  const milliers = Math.floor(n / 1000) % 1000;
  const reste = n % 1000;
  const morceaux: string[] = [];
  if (milliards) morceaux.push(`${moinsDeMille(milliards, true)} milliard${milliards > 1 ? "s" : ""}`);
  if (millions) morceaux.push(`${moinsDeMille(millions, true)} million${millions > 1 ? "s" : ""}`);
  if (milliers) morceaux.push(milliers === 1 ? "mille" : `${moinsDeMille(milliers, false)} mille`);
  if (reste) morceaux.push(moinsDeMille(reste, true));
  return morceaux.join(" ");
}

export function montantEnLettres(montant: number) {
  const n = Math.floor(Math.abs(montant));
  const de = n >= 1e6 && n % 1e6 === 0 ? "de " : "";
  const texte = `${enLettres(n)} ${de}franc${n > 1 ? "s" : ""} CFA`;
  return texte.charAt(0).toUpperCase() + texte.slice(1);
}
