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

export function urlFichierMessage(id: string) {
  return `/api/messages/fichier/${id}`;
}
