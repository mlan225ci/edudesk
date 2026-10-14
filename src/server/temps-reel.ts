import { EventEmitter } from "node:events";
import { apercuMessage } from "@/lib/messages";

export type FichierFlux = { nom: string; type: string; taille: number; duree: number | null };
export type ReponseFlux = { id: string; deId: string; deNom: string; apercu: string };

export const INCLURE_FLUX = {
  de: { select: { prenom: true, nom: true } },
  reponseA: { select: { id: true, deId: true, texte: true, fichierNom: true, duree: true, de: { select: { prenom: true, nom: true } } } },
} as const;

export type MessageFlux = {
  id: string;
  deId: string;
  aId: string;
  texte: string;
  creeLe: string;
  lu: boolean;
  deNom: string;
  fichier: FichierFlux | null;
  reponse: ReponseFlux | null;
  cle?: string;
};

export type EvenementFlux =
  | { type: "message"; message: MessageFlux }
  | { type: "lu"; par: string }
  | { type: "compteur"; nonLus: number }
  | { type: "ecrit"; par: string }
  | { type: "presence"; userId: string; enLigne: boolean; vuLe: string | null }
  | { type: "presences"; enLigne: string[] };

const TOUS = "*";
const DELAI_DEPART_MS = 6000;

const memoire = globalThis as typeof globalThis & {
  __edudeskBus?: EventEmitter;
  __edudeskConnexions?: Map<string, number>;
  __edudeskDeparts?: Map<string, ReturnType<typeof setTimeout>>;
};
const bus = (memoire.__edudeskBus ??= new EventEmitter().setMaxListeners(0));
const connexions = (memoire.__edudeskConnexions ??= new Map<string, number>());
const departs = (memoire.__edudeskDeparts ??= new Map<string, ReturnType<typeof setTimeout>>());

export function diffuser(userId: string, evenement: EvenementFlux) {
  bus.emit(userId, evenement);
}

export function diffuserTous(evenement: EvenementFlux) {
  bus.emit(TOUS, evenement);
}

export function ecouter(userId: string, rappel: (evenement: EvenementFlux) => void) {
  bus.on(userId, rappel);
  bus.on(TOUS, rappel);
  return () => {
    bus.off(userId, rappel);
    bus.off(TOUS, rappel);
  };
}

export function connectesIci() {
  return [...connexions.keys()];
}

/** Enregistre une connexion ; annonce l'arrivée quand c'est la première de l'utilisateur. */
export function connecter(userId: string) {
  const enAttente = departs.get(userId);
  if (enAttente) {
    clearTimeout(enAttente);
    departs.delete(userId);
  }
  const avant = connexions.get(userId) ?? 0;
  connexions.set(userId, avant + 1);
  if (avant === 0 && !enAttente) diffuserTous({ type: "presence", userId, enLigne: true, vuLe: null });
}

/** Retire une connexion ; le départ n'est annoncé qu'après un court délai (rechargement de page). */
export function deconnecter(userId: string, surDepart: () => void) {
  const restant = (connexions.get(userId) ?? 1) - 1;
  if (restant > 0) {
    connexions.set(userId, restant);
    return;
  }
  connexions.delete(userId);
  departs.set(
    userId,
    setTimeout(() => {
      departs.delete(userId);
      if (connexions.has(userId)) return;
      surDepart();
      diffuserTous({ type: "presence", userId, enLigne: false, vuLe: new Date().toISOString() });
    }, DELAI_DEPART_MS),
  );
}

export function versFlux(
  message: {
    id: string;
    deId: string;
    aId: string;
    texte: string;
    creeLe: Date;
    lu: boolean;
    de: { prenom: string; nom: string };
    fichierNom?: string | null;
    fichierType?: string | null;
    fichierTaille?: number | null;
    duree?: number | null;
    reponseA?: { id: string; deId: string; texte: string; fichierNom: string | null; duree: number | null; de: { prenom: string; nom: string } } | null;
  },
  cle?: string,
): MessageFlux {
  const origine = message.reponseA;
  return {
    id: message.id,
    deId: message.deId,
    aId: message.aId,
    texte: message.texte,
    creeLe: message.creeLe.toISOString(),
    lu: message.lu,
    deNom: `${message.de.prenom} ${message.de.nom}`.trim(),
    fichier: message.fichierNom
      ? { nom: message.fichierNom, type: message.fichierType ?? "application/octet-stream", taille: message.fichierTaille ?? 0, duree: message.duree ?? null }
      : null,
    reponse: origine
      ? { id: origine.id, deId: origine.deId, deNom: `${origine.de.prenom} ${origine.de.nom}`.trim(), apercu: apercuMessage(origine).slice(0, 200) }
      : null,
    cle,
  };
}
