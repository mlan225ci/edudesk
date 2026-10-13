import { cache } from "react";
import { prisma } from "@/lib/db";
import { debutJourAbidjan, debutMois } from "@/lib/format";

export const chargerDossiers = cache(() =>
  prisma.dossier.findMany({ select: { id: true, statut: true, ouvertLe: true, procedure: { select: { destination: true } } } }),
);

export const chargerProspects = cache(() =>
  prisma.prospect.findMany({ select: { source: true, converti: true, creeLe: true, relanceLe: true, creeParId: true } }),
);

export const chargerEtapesEnCours = cache(() =>
  prisma.dossierEtape.findMany({
    where: { statut: "EN_COURS" },
    select: {
      id: true,
      titre: true,
      responsableId: true,
      limiteLe: true,
      dossier: { select: { id: true, reference: true, client: true, procedure: { select: { destination: true } } } },
    },
  }),
);

export const chargerFlux = cache(async () => {
  const depuis = debutMois(-11);
  const [paiements, depenses] = await Promise.all([
    prisma.paiement.findMany({ where: { dateEncaissement: { gte: depuis } }, select: { montant: true, dateEncaissement: true } }),
    prisma.depense.findMany({ where: { date: { gte: depuis } }, select: { montant: true, date: true, categorie: true } }),
  ]);
  return { paiements, depenses };
});

export const chargerClotures = cache(() =>
  prisma.dossierEtape.findMany({ where: { statut: "CLOTUREE", clotureLe: { gte: debutMois(0) } }, select: { responsableId: true } }),
);

export const chargerAbsents = cache(() => {
  const maintenant = new Date();
  return prisma.conge.findMany({
    where: { statut: "VALIDE", debut: { lte: maintenant }, fin: { gte: debutJourAbidjan() } },
    include: { user: true },
  });
});
