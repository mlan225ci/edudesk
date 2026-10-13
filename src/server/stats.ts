import { prisma } from "@/lib/db";
import { cleMois, debutMois, labelMois } from "@/lib/format";

export const COMPTES_TRESORERIE = ["571", "521", "558"];

export async function situationDossiers() {
  const [dossiers, payes] = await Promise.all([
    prisma.dossier.findMany({
      where: { statut: { not: "REORIENTE" } },
      include: { client: true, procedure: true },
      orderBy: { ouvertLe: "desc" },
    }),
    prisma.paiement.groupBy({ by: ["dossierId"], _sum: { montant: true } }),
  ]);
  const parDossier = new Map(payes.map((ligne) => [ligne.dossierId, ligne._sum.montant ?? 0]));
  return dossiers.map((dossier) => {
    const convenu = dossier.montantConvenu ?? dossier.procedure.tarifXof;
    const paye = parDossier.get(dossier.id) ?? 0;
    return { dossier, convenu, paye, reste: Math.max(convenu - paye, 0) };
  });
}

export async function tresorerie() {
  const lignes = await prisma.ecriture.groupBy({
    by: ["compte"],
    where: { compte: { in: COMPTES_TRESORERIE } },
    _sum: { debit: true, credit: true },
  });
  const soldes = Object.fromEntries(COMPTES_TRESORERIE.map((compte) => [compte, 0])) as Record<string, number>;
  for (const ligne of lignes) soldes[ligne.compte] = (ligne._sum.debit ?? 0) - (ligne._sum.credit ?? 0);
  return { soldes, total: Object.values(soldes).reduce((somme, valeur) => somme + valeur, 0) };
}

export function moisGlissants(nombre: number) {
  return Array.from({ length: nombre }, (_, index) => {
    const debut = debutMois(index - nombre + 1);
    return { cle: cleMois(debut), label: labelMois(debut), debut };
  });
}

export function cumulParMois<T>(elements: T[], date: (element: T) => Date, valeur: (element: T) => number) {
  const totaux = new Map<string, number>();
  for (const element of elements) {
    const cle = cleMois(date(element));
    totaux.set(cle, (totaux.get(cle) ?? 0) + valeur(element));
  }
  return totaux;
}

export function compterPar<T>(elements: T[], cle: (element: T) => string) {
  const totaux = new Map<string, number>();
  for (const element of elements) totaux.set(cle(element), (totaux.get(cle(element)) ?? 0) + 1);
  return [...totaux.entries()].sort((a, b) => b[1] - a[1]);
}
