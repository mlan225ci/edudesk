export type SegmentGroupe =
  | { type: "texte"; texte: string }
  | { type: "personne"; nom: string }
  | { type: "dossier"; reference: string };

const DOSSIER = /^#(DOS-\d{4}-\d{5,})/;

/** Découpe un message de groupe : `@Prénom Nom` parmi les membres, `#DOS-AAAA-NNNNN` pour un dossier. */
export function decouperGroupe(texte: string, noms: string[]): SegmentGroupe[] {
  const tries = [...new Set(noms.map((nom) => nom.trim()).filter(Boolean))].sort((a, b) => b.length - a.length);
  const segments: SegmentGroupe[] = [];
  let index = 0;
  while (index < texte.length) {
    const signe = texte[index];
    if (signe === "@") {
      const reste = texte.slice(index + 1);
      const nom = tries.find((candidat) => commenceParNom(reste, candidat));
      if (nom) {
        segments.push({ type: "personne", nom: reste.slice(0, nom.length) });
        index += 1 + nom.length;
        continue;
      }
    }
    if (signe === "#") {
      const trouve = texte.slice(index).match(DOSSIER);
      if (trouve) {
        segments.push({ type: "dossier", reference: trouve[1] });
        index += trouve[0].length;
        continue;
      }
    }
    const suivant = texte.slice(index + 1).search(/[@#]/);
    const fin = suivant === -1 ? texte.length : index + 1 + suivant;
    segments.push({ type: "texte", texte: texte.slice(index, fin) });
    index = fin;
  }
  return segments;
}

function commenceParNom(reste: string, nom: string) {
  if (reste.length < nom.length) return false;
  if (reste.slice(0, nom.length).toLocaleLowerCase("fr") !== nom.toLocaleLowerCase("fr")) return false;
  const suite = reste[nom.length];
  return suite === undefined || /[\s.,!?;:)]/.test(suite);
}

export function jetonEnCours(valeur: string, curseur: number) {
  const avant = valeur.slice(0, curseur);
  const arobase = avant.lastIndexOf("@");
  const diese = avant.lastIndexOf("#");
  const debut = Math.max(arobase, diese);
  if (debut < 0) return null;
  const requete = avant.slice(debut + 1);
  if (requete.includes("\n") || requete.length > 60) return null;
  return { signe: avant[debut] as "@" | "#", requete, debut };
}
