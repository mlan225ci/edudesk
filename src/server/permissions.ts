import type { Role } from "@prisma/client";

export type SessionUser = {
  id: string;
  prenom: string;
  nom: string;
  email: string;
  telephone: string;
  role: Role;
  actif: boolean;
  partenaireId: string | null;
};

const FINANCE = new Set<Role>(["CEO", "ADMINISTRATEUR", "COMPTABLE", "RESPONSABLE_COMMERCIALE", "ASSISTANTE_ADMINISTRATIVE"]);
const PROSPECTS = new Set<Role>(["CEO", "ADMINISTRATEUR", "RESPONSABLE_COMMERCIALE", "COMMERCIAL"]);
const PROCEDURES = new Set<Role>(["CEO", "ADMINISTRATEUR", "RESPONSABLE_COMMERCIALE", "COMMERCIAL", "ASSISTANTE_ADMINISTRATIVE"]);
const DIRECTION = new Set<Role>(["CEO", "ADMINISTRATEUR", "RESPONSABLE_COMMERCIALE"]);
const ENCAISSER = new Set<Role>(["CEO", "ADMINISTRATEUR", "COMPTABLE", "RESPONSABLE_COMMERCIALE", "ASSISTANTE_ADMINISTRATIVE"]);
const REAFFECTER = new Set<Role>(["CEO", "ADMINISTRATEUR", "RESPONSABLE_COMMERCIALE"]);
const EQUIPE = new Set<Role>(["CEO", "ADMINISTRATEUR"]);
const DEPENSES = new Set<Role>(["CEO", "ADMINISTRATEUR", "COMPTABLE", "MOYENS_GENERAUX"]);
const PARTENAIRES = new Set<Role>(["CEO", "ADMINISTRATEUR", "RESPONSABLE_COMMERCIALE", "COMPTABLE"]);
const INVENTAIRE = new Set<Role>(["CEO", "ADMINISTRATEUR", "MOYENS_GENERAUX"]);
const MONTANTS = new Set<Role>(["CEO", "ADMINISTRATEUR", "RESPONSABLE_COMMERCIALE", "COMPTABLE"]);

export function voitDepenses(role: Role) {
  return DEPENSES.has(role);
}

export function peutAnnulerDepense(role: Role) {
  return role === "CEO" || role === "ADMINISTRATEUR" || role === "COMPTABLE";
}

export function voitPartenaires(role: Role) {
  return PARTENAIRES.has(role);
}

export function peutInventaire(role: Role) {
  return INVENTAIRE.has(role);
}

export function peutModifierMontant(role: Role) {
  return MONTANTS.has(role);
}

export function peutValiderConges(role: Role) {
  return role === "CEO" || role === "ADMINISTRATEUR";
}

export function voitRapports(role: Role) {
  return role === "CEO" || role === "ADMINISTRATEUR" || role === "COMPTABLE";
}

export function voitTousLesDossiers(role: Role) {
  return role !== "PARTENAIRE";
}

export function voitFinance(role: Role) {
  return FINANCE.has(role);
}

export function voitCompta(role: Role) {
  return role === "CEO" || role === "ADMINISTRATEUR" || role === "COMPTABLE";
}

export function peutProspects(role: Role) {
  return PROSPECTS.has(role);
}

export function peutProcedures(role: Role) {
  return PROCEDURES.has(role);
}

export function peutEcoles(role: Role) {
  return PROCEDURES.has(role) || role === "INFORMATICIEN_ECOLE";
}

export function peutCandidatures(role: Role) {
  return role !== "PARTENAIRE" && role !== "COMPTABLE" && role !== "MOYENS_GENERAUX";
}

export function voitDirection(role: Role) {
  return DIRECTION.has(role);
}

export function peutEncaisser(role: Role) {
  return ENCAISSER.has(role);
}

export function peutReaffecter(role: Role) {
  return REAFFECTER.has(role);
}

export function peutGererEquipe(role: Role) {
  return EQUIPE.has(role);
}

export function peutParametrer(role: Role) {
  return role === "CEO" || role === "ADMINISTRATEUR";
}

export function peutDevis(role: Role) {
  return FINANCE.has(role) || PROSPECTS.has(role);
}

export function peutFacturer(role: Role) {
  return FINANCE.has(role);
}

export function peutAnnulerFacture(role: Role) {
  return role === "CEO" || role === "ADMINISTRATEUR" || role === "COMPTABLE";
}

export function voitTraductions(role: Role) {
  return role === "TRADUCTEUR" || role === "CEO" || role === "ADMINISTRATEUR" || role === "ASSISTANTE_ADMINISTRATIVE" || role === "RESPONSABLE_COMMERCIALE";
}

export function peutTraduire(role: Role) {
  return role === "TRADUCTEUR" || role === "CEO" || role === "ADMINISTRATEUR";
}

export function ongletsParametres(role: Role): Lien[] {
  if (role === "PARTENAIRE") return [];
  const onglets: Lien[] = [];
  if (peutParametrer(role)) onglets.push({ href: "/parametres/entreprise", label: "Entreprise", icone: "entreprise" });
  if (peutParametrer(role)) onglets.push({ href: "/parametres/documents", label: "Devis et factures", icone: "facturation" });
  if (peutProcedures(role)) onglets.push({ href: "/parametres/procedures", label: "Procédures", icone: "procedures" });
  if (peutGererEquipe(role)) onglets.push({ href: "/parametres/equipe", label: "Utilisateurs", icone: "equipe" });
  if (voitDirection(role)) onglets.push({ href: "/parametres/sms", label: "SMS", icone: "sms" });
  if (voitDirection(role)) onglets.push({ href: "/parametres/email", label: "E-mail", icone: "email" });
  if (voitDirection(role)) onglets.push({ href: "/parametres/automatisation", label: "Automatisation", icone: "automatisation" });
  if (voitCompta(role)) onglets.push({ href: "/parametres/comptabilite", label: "Comptabilité", icone: "comptabilite" });
  return onglets;
}

export function peutCloturer(user: SessionUser, etape: { responsableId: string | null; roles: string }) {
  if (user.role === "CEO" || user.role === "ADMINISTRATEUR") return true;
  if (etape.responsableId === user.id) return true;
  return etape.roles.split(",").includes(user.role);
}

export function peutPiece(user: SessionUser, etape: { responsableId: string | null; roles: string }) {
  if (user.role === "ASSISTANTE_ADMINISTRATIVE") return true;
  return peutCloturer(user, etape);
}

export type Lien = { href: string; label: string; icone: string };
export type SectionNavigation = { titre: string; liens: Lien[] };

export function peutCreerClient(role: Role) {
  return PROSPECTS.has(role) || role === "ASSISTANTE_ADMINISTRATIVE";
}

export function actionsRapides(role: Role): Lien[] {
  if (role === "PARTENAIRE") return [];
  const actions: Lien[] = [];
  if (peutProspects(role)) actions.push({ href: "/prospects?nouveau=1", label: "Prospect", icone: "prospects" });
  if (peutCreerClient(role)) actions.push({ href: "/clients?nouveau=1", label: "Client et dossier", icone: "clients" });
  if (peutEncaisser(role)) actions.push({ href: "/caisse", label: "Encaissement", icone: "caisse" });
  if (voitDepenses(role)) actions.push({ href: "/depenses?nouveau=1", label: "Dépense", icone: "depenses" });
  actions.push({ href: "/conges?nouveau=1", label: "Demande d'absence", icone: "conges" });
  return actions;
}

export function navigation(role: Role): SectionNavigation[] {
  if (role === "PARTENAIRE") {
    return [
      {
        titre: "Espace partenaire",
        liens: [
          { href: "/dossiers", label: "Mes clients", icone: "dossiers" },
          { href: "/notifications", label: "Notifications", icone: "sms" },
        ],
      },
    ];
  }

  const pilotage: Lien[] = [{ href: "/tableau-de-bord", label: "Tableau de bord", icone: "tableau" }];
  if (voitDirection(role)) pilotage.push({ href: "/direction", label: "Direction", icone: "direction" });
  if (voitRapports(role)) pilotage.push({ href: "/rapports", label: "Rapports", icone: "rapports" });

  const commercial: Lien[] = [];
  if (peutProspects(role)) commercial.push({ href: "/prospects", label: "Prospects", icone: "prospects" });
  commercial.push({ href: "/clients", label: "Clients", icone: "clients" });
  if (voitPartenaires(role)) commercial.push({ href: "/partenaires", label: "Partenaires", icone: "partenaires" });

  const operations: Lien[] = [
    { href: "/missions", label: "Mes missions", icone: "missions" },
    { href: "/dossiers", label: "Dossiers", icone: "dossiers" },
  ];
  operations.push({ href: "/ecoles", label: "Écoles", icone: "ecoles" });
  if (voitTraductions(role)) operations.push({ href: "/traductions", label: "Traductions", icone: "traductions" });

  const finance: Lien[] = [];
  if (peutDevis(role)) finance.push({ href: "/facturation", label: "Devis et factures", icone: "facturation" });
  if (peutEncaisser(role)) finance.push({ href: "/caisse", label: "Caisse", icone: "caisse" });
  if (voitFinance(role)) finance.push({ href: "/creances", label: "Créances", icone: "creances" });
  if (voitDepenses(role)) finance.push({ href: "/depenses", label: "Dépenses", icone: "depenses" });
  if (voitCompta(role)) finance.push({ href: "/comptabilite", label: "Comptabilité", icone: "comptabilite" });

  const ressources: Lien[] = [];
  ressources.push({ href: "/messages", label: "Messagerie", icone: "messages" });
  ressources.push({ href: "/conges", label: "Congés et absences", icone: "conges" });
  if (peutInventaire(role)) ressources.push({ href: "/inventaire", label: "Inventaire", icone: "inventaire" });
  ressources.push({ href: "/notifications", label: "SMS et alertes", icone: "sms" });

  const administration: Lien[] = ongletsParametres(role).length > 0 ? [{ href: "/parametres", label: "Paramètres", icone: "parametres" }] : [];

  return [
    { titre: "Pilotage", liens: pilotage },
    { titre: "Commercial", liens: commercial },
    { titre: "Opérations", liens: operations },
    { titre: "Finance", liens: finance },
    { titre: "Ressources", liens: ressources },
    { titre: "Administration", liens: administration },
  ].filter((section) => section.liens.length > 0);
}
