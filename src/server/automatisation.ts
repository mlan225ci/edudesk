import { prisma } from "../lib/db";
import { flushSms, scannerAlertes } from "./engine";
import { ecrireParametres } from "./parametres";

const CLE_DERNIERE = "automatisation.derniereExecution";
const EPOQUE = "1970-01-01T00:00:00.000Z";

export type ConfigAutomatisation = {
  actif: boolean;
  minutes: number;
  derniere: Date | null;
  resultat: string | null;
  source: string | null;
};

export async function configAutomatisation(): Promise<ConfigAutomatisation> {
  const lignes = await prisma.parametre.findMany({ where: { cle: { startsWith: "automatisation." } } });
  const valeurs = new Map(lignes.map((ligne) => [ligne.cle.slice("automatisation.".length), ligne.valeur]));
  const derniere = valeurs.get("derniereExecution");
  return {
    actif: valeurs.get("actif") !== "0",
    minutes: Math.max(5, Number(valeurs.get("minutes")) || 15),
    derniere: derniere && derniere !== EPOQUE ? new Date(derniere) : null,
    resultat: valeurs.get("dernierResultat") ?? null,
    source: valeurs.get("derniereSource") ?? null,
  };
}

async function reserverPassage(minutes: number, force: boolean) {
  await prisma.parametre.upsert({ where: { cle: CLE_DERNIERE }, create: { cle: CLE_DERNIERE, valeur: EPOQUE }, update: {} });
  const seuil = force ? new Date(Date.now() - 30_000) : new Date(Date.now() - minutes * 60_000 + 5_000);
  const pris = await prisma.parametre.updateMany({
    where: { cle: CLE_DERNIERE, valeur: { lt: seuil.toISOString() } },
    data: { valeur: new Date().toISOString() },
  });
  return pris.count > 0;
}

export async function executerAutomatisation(source: "planificateur" | "manuel" | "cron", force = false) {
  const config = await configAutomatisation();
  if (!(await reserverPassage(config.minutes, force))) return null;
  const { alertes } = await scannerAlertes();
  const avant = new Date(Date.now() - 2 * 60_000);
  const [sms, mails] = await Promise.all([
    prisma.notificationSms.findMany({ where: { statut: "EN_ATTENTE", creeLe: { lt: avant } }, select: { id: true }, take: 100 }),
    prisma.notificationMail.findMany({ where: { statut: "EN_ATTENTE", creeLe: { lt: avant } }, select: { id: true }, take: 100 }),
  ]);
  await flushSms([...sms.map((ligne) => ligne.id), ...mails.map((ligne) => `mail:${ligne.id}`)]);
  const repris = sms.length + mails.length;
  const resultat = `${alertes} alerte(s) envoyée(s)${repris ? ` · ${repris} envoi(s) en attente repris` : ""}`;
  await ecrireParametres("automatisation", { dernierResultat: resultat, derniereSource: source });
  return { alertes, repris, resultat };
}

declare global {
  var __edudeskPlanificateur: boolean | undefined;
}

export function demarrerPlanificateur() {
  if (globalThis.__edudeskPlanificateur) return;
  globalThis.__edudeskPlanificateur = true;
  const tic = async () => {
    try {
      const config = await configAutomatisation();
      if (!config.actif) return;
      const resultat = await executerAutomatisation("planificateur");
      if (resultat) console.log(`[Planificateur] ${resultat.resultat}`);
    } catch (erreur) {
      console.error("[Planificateur]", erreur instanceof Error ? erreur.message : erreur);
    }
  };
  setTimeout(tic, 20_000);
  setInterval(tic, 60_000);
}
