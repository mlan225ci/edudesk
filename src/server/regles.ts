import { prisma } from "@/lib/db";
import { aLeRole, estLectureSeule, type SessionUser } from "@/server/permissions";

export const REGLES = [
  {
    id: "evolutionEmail",
    label: "Évolution par e-mail",
    description: "Le client reçoit l'avancement de sa procédure par e-mail. Le SMS de cette évolution est coupé.",
    defaut: true,
  },
  {
    id: "notifierTache",
    label: "Prévenir les collègues",
    description: "Quand une personne termine une tâche, les autres profils de l'étape reçoivent une notification.",
    defaut: true,
  },
  {
    id: "codeSuiviPublic",
    label: "Code de suivi Campus France public",
    description: "Un code de suivi est créé dès l'ouverture d'un dossier Campus France public.",
    defaut: true,
  },
  {
    id: "assistanteEtape3",
    label: "Assistante limitée à l'analyse",
    description: "Sur Campus France public, l'assistante ne coche que l'étape Analyse et proposition.",
    defaut: true,
  },
  {
    id: "informaticienEcole",
    label: "Informaticien école",
    description: "L'informaticien école ne peut pas cocher Formation ni Soumettre.",
    defaut: true,
  },
  {
    id: "commercialSansChoix",
    label: "Commercial sans choix d'école",
    description: "Le commercial ne modifie ni le choix d'école ni les traductions.",
    defaut: true,
  },
  {
    id: "suppressionReservee",
    label: "Suppression réservée",
    description: "Seul l'administrateur peut supprimer un client et ses dossiers. La direction, l'école et l'assistante ne le peuvent pas.",
    defaut: true,
  },
  {
    id: "retourEtape",
    label: "Retour d'étape",
    description: "Un bouton permet de rouvrir l'étape précédente d'un dossier.",
    defaut: true,
  },
  {
    id: "documentsMultiples",
    label: "Plusieurs documents",
    description: "Sur l'étape en cours, on peut ajouter plusieurs fichiers d'un coup.",
    defaut: true,
  },
  {
    id: "emailClient",
    label: "E-mail obligatoire",
    description: "Une fiche client doit avoir une adresse e-mail, pour recevoir le suivi de procédure.",
    defaut: false,
  },
] as const;

export type RegleId = (typeof REGLES)[number]["id"];

const IDS = new Set<string>(REGLES.map((regle) => regle.id));

export function estRegleId(valeur: string): valeur is RegleId {
  return IDS.has(valeur);
}

export async function lireRegles() {
  const lignes = await prisma.parametre.findMany({ where: { cle: { startsWith: "regle." } } });
  const valeurs = new Map(lignes.map((ligne) => [ligne.cle.slice("regle.".length), ligne.valeur]));
  return REGLES.map((regle) => ({
    ...regle,
    actif: valeurs.has(regle.id) ? valeurs.get(regle.id) === "1" : regle.defaut,
  }));
}

export async function regleActive(id: RegleId) {
  const ligne = await prisma.parametre.findUnique({ where: { cle: `regle.${id}` }, select: { valeur: true } });
  if (!ligne) return REGLES.find((regle) => regle.id === id)?.defaut ?? false;
  return ligne.valeur === "1";
}

export const FRAIS_VISA_DEFAUT = 250_000;

export async function fraisVisaXof() {
  const ligne = await prisma.parametre.findUnique({ where: { cle: "regle.fraisVisa" }, select: { valeur: true } });
  const montant = Number(ligne?.valeur);
  return Number.isInteger(montant) && montant >= 0 ? montant : FRAIS_VISA_DEFAUT;
}

export async function suppressionAutorisee(user: SessionUser) {
  if (estLectureSeule(user)) return false;
  if (aLeRole(user, "INFORMATICIEN_ECOLE", "INFORMATICIEN_FRANCE", "ASSISTANTE_ADMINISTRATIVE")) return false;
  if (await regleActive("suppressionReservee")) return aLeRole(user, "ADMINISTRATEUR") && !aLeRole(user, "CEO");
  return aLeRole(user, "ADMINISTRATEUR", "CEO");
}
