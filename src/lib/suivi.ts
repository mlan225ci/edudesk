import { randomInt } from "node:crypto";

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function genererCodeSuivi() {
  const brut = Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  return `${brut.slice(0, 4)}-${brut.slice(4)}`;
}

export function normaliserCodeSuivi(saisie: string) {
  const brut = saisie.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (brut.length !== 8 || [...brut].some((lettre) => !ALPHABET.includes(lettre))) return null;
  return `${brut.slice(0, 4)}-${brut.slice(4)}`;
}

export function lienSuivi(base?: string | null) {
  const racine = (process.env.URL_PUBLIQUE || base || "http://localhost:3000").replace(/\/+$/, "");
  return `${racine}/suivi`;
}
