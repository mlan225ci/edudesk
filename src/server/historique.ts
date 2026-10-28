import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { nomComplet } from "@/lib/format";

export const LIBELLES_ACTIONS: Record<string, string> = {
  OUVERTURE: "Ouverture de dossier",
  CLOTURE_ETAPE: "Étape clôturée",
  BOUCLE: "Retour en boucle",
  RELANCE: "Relance",
  REORIENTATION: "Réorientation",
  CODE_SUIVI: "Code de suivi",
  DEVIS: "Devis",
  FACTURE: "Facture",
  FACTURE_ENVOYEE: "Facture envoyée",
  PAIEMENT: "Paiement",
  PIECE_RECUE: "Pièce reçue",
  PIECE_REFUSEE: "Pièce refusée",
  PIECE_DEPOSEE_CLIENT: "Pièce déposée par le client",
  PIECES_RELANCE: "Relance de pièces",
  PIECE_CONSULTEE: "Document consulté",
  TACHE_FAITE: "Tâche cochée",
  TACHE_REPRISE: "Tâche rouverte",
  REAFFECTATION: "Réaffectation",
  DELAI: "Délai modifié",
  MONTANT_CONVENU: "Montant convenu",
  CLIENT: "Fiche client",
  CONVERSION: "Prospect converti",
  DEPENSE: "Dépense",
  DEPENSE_ANNULEE: "Dépense annulée",
  MATERIEL: "Matériel",
  PROCEDURE: "Procédure",
  ECOLE: "École",
  CANDIDATURE: "Candidature",
  TRADUCTION: "Traduction",
  PARAMETRES: "Paramètres",
  GROUPE: "Groupe d'échanges",
};

export function libelleAction(action: string) {
  return LIBELLES_ACTIONS[action] ?? action.replaceAll("_", " ").toLocaleLowerCase("fr");
}

export type LigneJournal = {
  id: string;
  creeLe: Date;
  auteur: string;
  action: string;
  detail: string | null;
  lien: string | null;
};

function lienDe(entite: string, entiteId: string) {
  if (entite === "Client") return `/clients/${entiteId}`;
  if (entite === "Dossier") return `/dossiers/${entiteId}`;
  if (entite === "Ecole") return `/ecoles/${entiteId}`;
  return null;
}

type FiltreJournal = {
  q?: string;
  auteurId?: string;
  action?: string;
  clientId?: string;
  dossierIds?: string[];
  consultations?: boolean;
  take?: number;
  skip?: number;
};

export async function lireJournal(filtre: FiltreJournal): Promise<LigneJournal[]> {
  const q = filtre.q?.trim();
  const where: Prisma.AuditWhereInput = {};
  if (!filtre.consultations) where.action = { not: "PIECE_CONSULTEE" };
  if (filtre.action && LIBELLES_ACTIONS[filtre.action]) where.action = filtre.action;
  if (filtre.auteurId) where.userId = filtre.auteurId;
  if (filtre.clientId) {
    where.OR = [
      { entite: "Client", entiteId: filtre.clientId },
      { entite: "Dossier", entiteId: { in: filtre.dossierIds?.length ? filtre.dossierIds : ["__aucun__"] } },
    ];
  }
  if (q) {
    const recherche: Prisma.AuditWhereInput = {
      OR: [
        { detail: { contains: q, mode: "insensitive" } },
        { action: { contains: q, mode: "insensitive" } },
        { user: { prenom: { contains: q, mode: "insensitive" } } },
        { user: { nom: { contains: q, mode: "insensitive" } } },
      ],
    };
    where.AND = [...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []), recherche];
  }

  const lignes = await prisma.audit.findMany({
    where,
    include: { user: { select: { prenom: true, nom: true } } },
    orderBy: { creeLe: "desc" },
    take: filtre.take ?? 40,
    skip: filtre.skip ?? 0,
  });

  return lignes.map((ligne) => ({
    id: ligne.id,
    creeLe: ligne.creeLe,
    auteur: ligne.user ? nomComplet(ligne.user) : "Système",
    action: libelleAction(ligne.action),
    detail: ligne.detail,
    lien: lienDe(ligne.entite, ligne.entiteId),
  }));
}
