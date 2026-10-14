import type { Prisma } from "@prisma/client";
import { nomComplet } from "@/lib/format";
import { STATUTS } from "@/lib/labels";

export const CHAMPS_DOSSIER_FACTURABLE = {
  id: true,
  reference: true,
  statut: true,
  client: { select: { prenom: true, nom: true, telephone: true } },
  procedure: { select: { nom: true, tarifXof: true } },
} satisfies Prisma.DossierSelect;

export type DossierFacturable = {
  id: string;
  reference: string;
  client: string;
  telephone: string;
  procedure: string;
  tarif: number;
  statut: string;
};

export function versDossierFacturable(dossier: Prisma.DossierGetPayload<{ select: typeof CHAMPS_DOSSIER_FACTURABLE }>): DossierFacturable {
  return {
    id: dossier.id,
    reference: dossier.reference,
    client: nomComplet(dossier.client),
    telephone: dossier.client.telephone,
    procedure: dossier.procedure.nom,
    tarif: dossier.procedure.tarifXof,
    statut: STATUTS[dossier.statut],
  };
}
