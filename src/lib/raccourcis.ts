export type RaccourciId =
  | "recherche"
  | "nouveau"
  | "accueil"
  | "missions"
  | "messages"
  | "notifications"
  | "dossiers"
  | "clients"
  | "prospects"
  | "facturation"
  | "aide"
  | "profil";

export type Combinaison = {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
};

export type DefinitionRaccourci = {
  id: RaccourciId;
  label: string;
  description: string;
  groupe: string;
  href?: string;
  /** Action locale gérée par la barre (recherche, menu Nouveau). */
  action?: "recherche" | "nouveau";
};

export const RACCOURCIS: DefinitionRaccourci[] = [
  { id: "recherche", label: "Recherche", description: "Ouvre la recherche rapide.", groupe: "Général", action: "recherche" },
  { id: "nouveau", label: "Nouveau", description: "Ouvre le menu de création rapide.", groupe: "Général", action: "nouveau" },
  { id: "accueil", label: "Accueil", description: "Retourne au tableau de bord ou à l'espace partenaire.", groupe: "Navigation", href: "__accueil__" },
  { id: "missions", label: "Missions", description: "Ouvre Mes missions.", groupe: "Navigation", href: "/missions" },
  { id: "messages", label: "Messagerie", description: "Ouvre la messagerie.", groupe: "Navigation", href: "/messages" },
  { id: "notifications", label: "Notifications", description: "Ouvre les alertes et SMS.", groupe: "Navigation", href: "/notifications" },
  { id: "dossiers", label: "Dossiers", description: "Ouvre la liste des dossiers.", groupe: "Navigation", href: "/dossiers" },
  { id: "clients", label: "Clients", description: "Ouvre la liste des clients.", groupe: "Navigation", href: "/clients" },
  { id: "prospects", label: "Prospects", description: "Ouvre le pipeline commercial.", groupe: "Navigation", href: "/prospects" },
  { id: "facturation", label: "Devis et factures", description: "Ouvre la facturation.", groupe: "Navigation", href: "/facturation" },
  { id: "aide", label: "Aide", description: "Ouvre le guide.", groupe: "Compte", href: "/aide" },
  { id: "profil", label: "Mon profil", description: "Ouvre mon profil et les réglages de raccourcis.", groupe: "Compte", href: "/profil" },
];

/** Ctrl+Alt évite les conflits navigateur (Ctrl+Maj+N = navigation privée, etc.). */
export const RACCOURCIS_DEFAUT: Record<RaccourciId, Combinaison | null> = {
  recherche: { key: "k", ctrl: true },
  nouveau: { key: "n", ctrl: true, alt: true },
  accueil: { key: "h", ctrl: true, alt: true },
  missions: { key: "m", ctrl: true, alt: true },
  messages: { key: "i", ctrl: true, alt: true },
  notifications: { key: "b", ctrl: true, alt: true },
  dossiers: { key: "d", ctrl: true, alt: true },
  clients: { key: "c", ctrl: true, alt: true },
  prospects: { key: "p", ctrl: true, alt: true },
  facturation: { key: "f", ctrl: true, alt: true },
  aide: { key: "/", ctrl: true },
  profil: { key: "u", ctrl: true, alt: true },
};

const STOCKAGE = "edudesk.raccourcis.v2";
const STOCKAGE_ANCIEN = "edudesk.raccourcis";

export function normaliserTouche(key: string) {
  if (key === " ") return "space";
  if (key.length === 1) return key.toLowerCase();
  return key.toLowerCase();
}

export function combinaisonDepuisEvenement(event: KeyboardEvent): Combinaison | null {
  const key = normaliserTouche(event.key);
  if (["control", "shift", "alt", "meta", "os"].includes(key)) return null;
  return {
    key,
    ctrl: event.ctrlKey || event.metaKey || undefined,
    shift: event.shiftKey || undefined,
    alt: event.altKey || undefined,
  };
}

export function memeCombinaison(a: Combinaison | null | undefined, b: Combinaison | null | undefined) {
  if (!a || !b) return false;
  return (
    a.key === b.key &&
    Boolean(a.ctrl) === Boolean(b.ctrl) &&
    Boolean(a.shift) === Boolean(b.shift) &&
    Boolean(a.alt) === Boolean(b.alt)
  );
}

export function labelCombinaison(combo: Combinaison | null | undefined) {
  if (!combo) return "Aucun";
  const parts: string[] = [];
  if (combo.ctrl) parts.push("Ctrl");
  if (combo.shift) parts.push("Maj");
  if (combo.alt) parts.push("Alt");
  const touche =
    combo.key === " " || combo.key === "space"
      ? "Espace"
      : combo.key === "/"
        ? "/"
        : combo.key.length === 1
          ? combo.key.toUpperCase()
          : combo.key;
  parts.push(touche);
  return parts.join(" + ");
}

export function lireRaccourcis(): Record<RaccourciId, Combinaison | null> {
  const base = { ...RACCOURCIS_DEFAUT };
  if (typeof window === "undefined") return base;
  try {
    if (!window.localStorage.getItem(STOCKAGE) && window.localStorage.getItem(STOCKAGE_ANCIEN)) {
      window.localStorage.removeItem(STOCKAGE_ANCIEN);
    }
    const brut = window.localStorage.getItem(STOCKAGE);
    if (!brut) return base;
    const lu = JSON.parse(brut) as Partial<Record<RaccourciId, Combinaison | null>>;
    for (const def of RACCOURCIS) {
      if (Object.prototype.hasOwnProperty.call(lu, def.id)) {
        const valeur = lu[def.id];
        if (valeur === null) base[def.id] = null;
        else if (valeur && typeof valeur.key === "string") {
          base[def.id] = {
            key: normaliserTouche(valeur.key),
            ctrl: valeur.ctrl || undefined,
            shift: valeur.shift || undefined,
            alt: valeur.alt || undefined,
          };
        }
      }
    }
  } catch {
    return base;
  }
  return base;
}

export function ecrireRaccourcis(carte: Record<RaccourciId, Combinaison | null>) {
  window.localStorage.setItem(STOCKAGE, JSON.stringify(carte));
}

export function reinitialiserRaccourcis() {
  window.localStorage.removeItem(STOCKAGE);
  return { ...RACCOURCIS_DEFAUT };
}

export function trouverRaccourci(
  carte: Record<RaccourciId, Combinaison | null>,
  event: KeyboardEvent,
): DefinitionRaccourci | null {
  const saisie = combinaisonDepuisEvenement(event);
  if (!saisie) return null;
  if (!saisie.ctrl && !saisie.alt) return null;
  for (const def of RACCOURCIS) {
    if (memeCombinaison(carte[def.id], saisie)) return def;
  }
  return null;
}

export function conflitRaccourci(
  carte: Record<RaccourciId, Combinaison | null>,
  id: RaccourciId,
  combo: Combinaison | null,
) {
  if (!combo) return null;
  for (const def of RACCOURCIS) {
    if (def.id === id) continue;
    if (memeCombinaison(carte[def.id], combo)) return def;
  }
  return null;
}

export function dansChampSaisie(cible: EventTarget | null) {
  if (!(cible instanceof HTMLElement)) return false;
  const tag = cible.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (cible.isContentEditable) return true;
  return Boolean(cible.closest("[contenteditable='true'], input, textarea, select"));
}
