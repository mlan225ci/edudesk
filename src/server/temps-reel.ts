import { EventEmitter } from "node:events";

export type MessageFlux = {
  id: string;
  deId: string;
  aId: string;
  texte: string;
  creeLe: string;
  lu: boolean;
  deNom: string;
  cle?: string;
};

export type EvenementFlux =
  | { type: "message"; message: MessageFlux }
  | { type: "lu"; par: string }
  | { type: "compteur"; nonLus: number };

const memoire = globalThis as typeof globalThis & { __edudeskBus?: EventEmitter };
const bus = (memoire.__edudeskBus ??= new EventEmitter().setMaxListeners(0));

export function diffuser(userId: string, evenement: EvenementFlux) {
  bus.emit(userId, evenement);
}

export function ecouter(userId: string, rappel: (evenement: EvenementFlux) => void) {
  bus.on(userId, rappel);
  return () => {
    bus.off(userId, rappel);
  };
}

export function versFlux(
  message: { id: string; deId: string; aId: string; texte: string; creeLe: Date; lu: boolean; de: { prenom: string; nom: string } },
  cle?: string,
): MessageFlux {
  return {
    id: message.id,
    deId: message.deId,
    aId: message.aId,
    texte: message.texte,
    creeLe: message.creeLe.toISOString(),
    lu: message.lu,
    deNom: `${message.de.prenom} ${message.de.nom}`.trim(),
    cle,
  };
}
