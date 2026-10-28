import { cache } from "react";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  peutDevis,
  peutEncaisser,
  peutFacturer,
  peutHistorique,
  peutInventaire,
  peutProspects,
  voitCompta,
  voitDepenses,
  voitDirection,
  voitFinance,
  voitPartenaires,
  voitRapports,
  voitTraductions,
} from "@/server/permissions";

export const ACCES = [
  { id: "direction", groupe: "Pilotage", label: "Direction", icone: "direction", description: "Synthèse des retards, destinations et commissions.", prefixes: ["/direction"] },
  { id: "historique", groupe: "Pilotage", label: "Historique", icone: "historique", description: "Journal des actions de l'application.", prefixes: ["/historique"] },
  { id: "rapports", groupe: "Pilotage", label: "Rapports", icone: "rapports", description: "Statistiques et exports.", prefixes: ["/rapports", "/api/rapport"] },
  { id: "prospects", groupe: "Commercial", label: "Prospects", icone: "prospects", description: "Contacts avant qu'ils deviennent clients.", prefixes: ["/prospects"] },
  { id: "clients", groupe: "Commercial", label: "Clients", icone: "clients", description: "Fiches clients.", prefixes: ["/clients"] },
  { id: "partenaires", groupe: "Commercial", label: "Partenaires", icone: "partenaires", description: "Apporteurs d'affaires et commissions.", prefixes: ["/partenaires"] },
  { id: "missions", groupe: "Opérations", label: "Missions", icone: "missions", description: "Étapes confiées et rappels du jour.", prefixes: ["/missions"] },
  { id: "dossiers", groupe: "Opérations", label: "Dossiers", icone: "dossiers", description: "Dossiers et leur traitement.", prefixes: ["/dossiers"] },
  { id: "ecoles", groupe: "Opérations", label: "Écoles", icone: "ecoles", description: "Catalogue des écoles et candidatures.", prefixes: ["/ecoles"] },
  { id: "traductions", groupe: "Opérations", label: "Traductions", icone: "traductions", description: "Demandes de traduction.", prefixes: ["/traductions", "/api/traductions"] },
  { id: "devis", groupe: "Finance", label: "Devis", icone: "devis", description: "Établissement et suivi des devis.", prefixes: [] },
  { id: "factures", groupe: "Finance", label: "Factures", icone: "facture", description: "Émission des factures et règlements.", prefixes: [] },
  { id: "caisse", groupe: "Finance", label: "Caisse", icone: "caisse", description: "Journal de caisse.", prefixes: ["/caisse"] },
  { id: "creances", groupe: "Finance", label: "Créances", icone: "creances", description: "Sommes restant dues.", prefixes: ["/creances"] },
  { id: "depenses", groupe: "Finance", label: "Dépenses", icone: "depenses", description: "Dépenses du bureau.", prefixes: ["/depenses"] },
  { id: "comptabilite", groupe: "Finance", label: "Comptabilité", icone: "comptabilite", description: "Journaux et plan comptable.", prefixes: ["/comptabilite"] },
  { id: "messagerie", groupe: "Ressources", label: "Messagerie", icone: "messages", description: "Messages entre collaborateurs.", prefixes: ["/messages", "/api/messages"] },
  { id: "conges", groupe: "Ressources", label: "Congés et absences", icone: "conges", description: "Demandes d'absence.", prefixes: ["/conges"] },
  { id: "inventaire", groupe: "Ressources", label: "Inventaire", icone: "inventaire", description: "Stock et matériel.", prefixes: ["/inventaire"] },
  { id: "notifications", groupe: "Ressources", label: "Notifications", icone: "sms", description: "Centre des notifications.", prefixes: ["/notifications"] },
] as const;

export type AccesId = (typeof ACCES)[number]["id"];
export type AccesEffectif = Record<AccesId, boolean>;

const IDS = new Set<string>(ACCES.map((acces) => acces.id));

export function estAccesId(valeur: string): valeur is AccesId {
  return IDS.has(valeur);
}

export function accesParDefaut(role: Role): AccesEffectif {
  const salarie = role !== "PARTENAIRE";
  return {
    direction: voitDirection(role),
    historique: peutHistorique(role),
    rapports: voitRapports(role),
    prospects: peutProspects(role),
    clients: salarie,
    partenaires: voitPartenaires(role),
    missions: salarie,
    dossiers: true,
    ecoles: salarie,
    traductions: voitTraductions(role),
    devis: peutDevis(role),
    factures: peutFacturer(role),
    caisse: peutEncaisser(role),
    creances: voitFinance(role),
    depenses: voitDepenses(role),
    comptabilite: voitCompta(role),
    messagerie: salarie,
    conges: salarie,
    inventaire: peutInventaire(role),
    notifications: true,
  };
}

export function accesDuChemin(chemin: string): AccesId | null {
  const [cheminNu, recherche = ""] = chemin.split("?");
  if (cheminNu.startsWith("/parametres")) return null;
  const params = new URLSearchParams(recherche);
  if (cheminNu === "/facturation" || cheminNu.startsWith("/facturation/") || /^\/dossiers\/[^/]+\/factures(\/|$)/.test(cheminNu)) {
    const facture = cheminNu.startsWith("/facturation/factures") || /^\/dossiers\/[^/]+\/factures(\/|$)/.test(cheminNu) || params.get("vue") === "factures" || params.get("nouveau") === "facture";
    return facture ? "factures" : "devis";
  }
  let trouve: AccesId | null = null;
  let longueur = 0;
  for (const acces of ACCES) {
    for (const prefixe of acces.prefixes) {
      if ((cheminNu === prefixe || cheminNu.startsWith(`${prefixe}/`)) && prefixe.length > longueur) {
        trouve = acces.id;
        longueur = prefixe.length;
      }
    }
  }
  return trouve;
}

function appliquer(base: AccesEffectif, lignes: { cle: string; autorise: boolean }[]) {
  for (const ligne of lignes) {
    if (estAccesId(ligne.cle)) base[ligne.cle] = ligne.autorise;
  }
  return base;
}

export const lireAcces = cache(async function lireAcces(user: { id: string; role: Role }): Promise<AccesEffectif> {
  const [roles, comptes] = await Promise.all([
    prisma.accesRole.findMany({ where: { role: user.role } }),
    prisma.accesCompte.findMany({ where: { userId: user.id } }),
  ]);
  const droits = appliquer(accesParDefaut(user.role), roles);
  return appliquer(droits, comptes);
});

export async function lireReglageRole(role: Role) {
  const lignes = await prisma.accesRole.findMany({ where: { role } });
  return appliquer(accesParDefaut(role), lignes);
}

export async function lireReglageCompte(userId: string) {
  const compte = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true, prenom: true, nom: true, actif: true } });
  if (!compte) return null;
  const [roles, exceptions] = await Promise.all([
    prisma.accesRole.findMany({ where: { role: compte.role } }),
    prisma.accesCompte.findMany({ where: { userId } }),
  ]);
  const duRole = appliquer(accesParDefaut(compte.role), roles);
  const effectif = appliquer({ ...duRole }, exceptions);
  const personnalises = new Set(exceptions.map((ligne) => ligne.cle).filter(estAccesId));
  return { compte, duRole, effectif, personnalises };
}

export async function aLeDroit(user: { id: string; role: Role }, id: AccesId) {
  return (await lireAcces(user))[id];
}
