export function dureeTexte(secondes: number) {
  const total = Math.max(0, Math.round(secondes));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export function tailleTexte(octets: number) {
  if (octets < 1024) return `${octets} o`;
  if (octets < 1024 * 1024) return `${Math.round(octets / 1024)} Ko`;
  return `${(octets / (1024 * 1024)).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Mo`;
}

export function apercuMessage(message: { texte: string; fichierNom?: string | null; duree?: number | null; fichier?: { nom: string; duree: number | null } | null }) {
  if (message.texte) return message.texte;
  const duree = message.fichier ? message.fichier.duree : message.duree;
  const nom = message.fichier ? message.fichier.nom : message.fichierNom;
  if (duree != null) return `Note vocale (${dureeTexte(duree)})`;
  if (nom) return `Fichier : ${nom}`;
  return "";
}

export type ResultatRecherche = {
  id: string;
  autreId: string;
  autreNom: string;
  moi: boolean;
  extrait: string;
  creeLe: string;
};

export type DossierMention = {
  id: string;
  reference: string;
  client: string;
  destination: string;
  statut: string;
};

export const REFERENCE_DOSSIER = /^DOS-\d{4}-\d{5,}$/;

/** Découpe le texte en segments de texte libre et en mentions `@DOS-AAAA-NNNNN`. */
export function decouperMentions(texte: string) {
  const segments: ({ type: "texte"; texte: string } | { type: "dossier"; reference: string })[] = [];
  const motif = /(^|[^\p{L}\p{N}_])@(DOS-\d{4}-\d{5,})(?![\p{L}\p{N}])/gu;
  let curseur = 0;
  for (const trouve of texte.matchAll(motif)) {
    const debut = (trouve.index ?? 0) + trouve[1].length;
    if (debut > curseur) segments.push({ type: "texte", texte: texte.slice(curseur, debut) });
    segments.push({ type: "dossier", reference: trouve[2] });
    curseur = debut + 1 + trouve[2].length;
  }
  if (curseur < texte.length) segments.push({ type: "texte", texte: texte.slice(curseur) });
  return segments;
}

export function referencesMentionnees(texte: string) {
  return decouperMentions(texte).flatMap((segment) => (segment.type === "dossier" ? [segment.reference] : []));
}

export function urlFichierMessage(id: string) {
  return `/api/messages/fichier/${id}`;
}

function replier(caractere: string) {
  return caractere.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("fr");
}

/** Texte sans accents ni majuscules, avec pour chaque caractère replié sa position d'origine. */
function replierAvecPositions(texte: string) {
  let replie = "";
  const positions: number[] = [];
  let index = 0;
  for (const caractere of texte) {
    for (const morceau of replier(caractere)) {
      replie += morceau;
      positions.push(index);
    }
    index += caractere.length;
  }
  positions.push(index);
  return { replie, positions };
}

export function normaliserRecherche(texte: string) {
  return [...texte.trim().replace(/\s+/g, " ")].map(replier).join("");
}

export function correspond(texte: string, requete: string) {
  const cible = normaliserRecherche(requete);
  return cible.length > 0 && replierAvecPositions(texte).replie.includes(cible);
}

/** Découpe le texte en segments, `trouve` marquant chaque occurrence de la recherche (accents et casse ignorés). */
export function decouperSurlignage(texte: string, requete: string) {
  const cible = normaliserRecherche(requete);
  if (!cible) return [{ texte, trouve: false }];
  const { replie, positions } = replierAvecPositions(texte);
  const segments: { texte: string; trouve: boolean }[] = [];
  let curseur = 0;
  let depart = replie.indexOf(cible);
  while (depart !== -1) {
    const debut = positions[depart];
    const fin = positions[depart + cible.length];
    if (debut > curseur) segments.push({ texte: texte.slice(curseur, debut), trouve: false });
    if (fin > debut) segments.push({ texte: texte.slice(debut, fin), trouve: true });
    curseur = Math.max(curseur, fin);
    depart = replie.indexOf(cible, depart + cible.length);
  }
  if (curseur < texte.length) segments.push({ texte: texte.slice(curseur), trouve: false });
  return segments;
}

/** Extrait court centré sur la première occurrence de la recherche. */
export function extraitRecherche(texte: string, requete: string, avant = 40, longueur = 140) {
  const plat = texte.replace(/\s+/g, " ").trim();
  const cible = normaliserRecherche(requete);
  const { replie, positions } = replierAvecPositions(plat);
  const trouve = cible ? replie.indexOf(cible) : -1;
  const debut = trouve > avant ? positions[trouve] - avant : 0;
  const extrait = plat.slice(debut, debut + longueur);
  return `${debut > 0 ? "…" : ""}${extrait}${debut + longueur < plat.length ? "…" : ""}`;
}
