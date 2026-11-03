import type { Role } from "@prisma/client";
import type { AccesEffectif } from "@/server/acces";
import { lienAutorise, type ModulesActifs } from "@/server/modules";

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

const FINANCE = new Set<Role>(["CEO", "ADMINISTRATEUR", "COMPTABLE", "RESPONSABLE_COMMERCIALE"]);
const PROSPECTS = new Set<Role>(["CEO", "ADMINISTRATEUR", "RESPONSABLE_COMMERCIALE", "COMMERCIAL", "COMMUNITY_MANAGER"]);
const PROCEDURES = new Set<Role>(["CEO", "ADMINISTRATEUR", "RESPONSABLE_COMMERCIALE", "COMMERCIAL", "ASSISTANTE_ADMINISTRATIVE"]);
const DIRECTION = new Set<Role>(["CEO", "ADMINISTRATEUR", "RESPONSABLE_COMMERCIALE"]);
const ENCAISSER = new Set<Role>(["CEO", "ADMINISTRATEUR", "COMPTABLE", "RESPONSABLE_COMMERCIALE"]);
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

export function estProduction(role: Role) {
  return role === "INFORMATICIEN_VISA" || role === "INFORMATICIEN_ECOLE" || role === "INFORMATICIEN_FRANCE";
}

export function chargeEtape(role: Role, roles: string) {
  const liste = roles.split(",").filter(Boolean);
  if (liste.includes(role)) return true;
  return role === "INFORMATICIEN_FRANCE" && liste.includes("INFORMATICIEN_ECOLE");
}

export function peutEcoles(role: Role) {
  return PROCEDURES.has(role) || role === "INFORMATICIEN_ECOLE" || role === "INFORMATICIEN_FRANCE";
}

export function peutCandidatures(role: Role) {
  return role !== "PARTENAIRE" && role !== "COMPTABLE" && role !== "MOYENS_GENERAUX";
}

export function voitDirection(role: Role) {
  return DIRECTION.has(role);
}

export function peutHistorique(role: Role) {
  return role === "CEO";
}

export function peutSigner(role: Role) {
  return role === "CEO" || role === "ADMINISTRATEUR";
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
  return role !== "COMMUNITY_MANAGER" && (FINANCE.has(role) || PROSPECTS.has(role));
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

function filtrerLiens(liens: Lien[], modules?: ModulesActifs) {
  return liens.filter((lien) => lienAutorise(lien.href, modules));
}

export function ongletsParametres(role: Role, modules?: ModulesActifs): Lien[] {
  if (!peutParametrer(role)) return [];
  const onglets: Lien[] = [
    { href: "/parametres/entreprise", label: "Entreprise", icone: "entreprise" },
    { href: "/parametres/documents", label: "Devis et factures", icone: "facturation" },
    { href: "/parametres/procedures", label: "Procédures", icone: "procedures" },
    { href: "/parametres/equipe", label: "Utilisateurs", icone: "equipe" },
    { href: "/parametres/acces", label: "Accès", icone: "acces" },
    { href: "/parametres/sms", label: "SMS", icone: "sms" },
    { href: "/parametres/email", label: "E-mail", icone: "email" },
    { href: "/parametres/automatisation", label: "Automatisation", icone: "automatisation" },
    { href: "/parametres/comptabilite", label: "Comptabilité", icone: "comptabilite" },
    { href: "/parametres/fonctionnalites", label: "Fonctionnalités", icone: "modules" },
  ];
  return filtrerLiens(onglets, modules);
}

export function peutCloturer(user: SessionUser, etape: { responsableId: string | null; roles: string }) {
  if (user.role === "CEO" || user.role === "ADMINISTRATEUR") return true;
  if (etape.responsableId === user.id) return true;
  return chargeEtape(user.role, etape.roles);
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

export function actionsRapides(role: Role, modules?: ModulesActifs, droits?: AccesEffectif): Lien[] {
  if (role === "PARTENAIRE") return [];
  const oui = (id: keyof AccesEffectif, sinon: boolean) => (droits ? droits[id] : sinon);
  const actions: Lien[] = [];
  if (oui("prospects", peutProspects(role))) actions.push({ href: "/prospects?nouveau=1", label: "Prospect", icone: "prospects" });
  if (oui("clients", peutCreerClient(role))) actions.push({ href: "/clients?nouveau=1", label: "Client et dossier", icone: "clients" });
  if (oui("devis", peutDevis(role))) actions.push({ href: "/facturation?nouveau=devis", label: "Devis", icone: "devis" });
  if (oui("factures", peutFacturer(role))) actions.push({ href: "/facturation?vue=factures&nouveau=facture", label: "Facture", icone: "facture" });
  if (oui("caisse", peutEncaisser(role))) actions.push({ href: "/caisse", label: "Encaissement", icone: "caisse" });
  if (oui("depenses", voitDepenses(role))) actions.push({ href: "/depenses?nouveau=1", label: "Dépense", icone: "depenses" });
  if (oui("conges", true)) actions.push({ href: "/conges?nouveau=1", label: "Demande d'absence", icone: "conges" });
  return filtrerLiens(actions, modules);
}

export function navigation(role: Role, modules?: ModulesActifs, droits?: AccesEffectif): SectionNavigation[] {
  const oui = (id: keyof AccesEffectif, sinon: boolean) => (droits ? droits[id] : sinon);
  if (role === "PARTENAIRE") {
    const liens: Lien[] = [];
    if (oui("dossiers", true)) liens.push({ href: "/dossiers", label: "Mes clients", icone: "dossiers" });
    if (oui("notifications", true)) liens.push({ href: "/notifications", label: "Notifications", icone: "sms" });
    return [{ titre: "Espace partenaire", liens: filtrerLiens(liens, modules) }].filter((section) => section.liens.length > 0);
  }

  const pilotage: Lien[] = [{ href: "/tableau-de-bord", label: "Tableau de bord", icone: "tableau" }];
  if (oui("direction", voitDirection(role))) pilotage.push({ href: "/direction", label: "Direction", icone: "direction" });
  if (oui("historique", peutHistorique(role))) pilotage.push({ href: "/historique", label: "Historique", icone: "historique" });
  if (oui("rapports", voitRapports(role))) pilotage.push({ href: "/rapports", label: "Rapports", icone: "rapports" });

  const commercial: Lien[] = [];
  if (oui("prospects", peutProspects(role))) commercial.push({ href: "/prospects", label: "Prospects", icone: "prospects" });
  if (oui("clients", true)) commercial.push({ href: "/clients", label: "Clients", icone: "clients" });
  if (oui("partenaires", voitPartenaires(role))) commercial.push({ href: "/partenaires", label: "Partenaires", icone: "partenaires" });

  const operations: Lien[] = [];
  if (oui("missions", true)) operations.push({ href: "/missions", label: "Mes missions", icone: "missions" });
  if (oui("dossiers", true)) operations.push({ href: "/dossiers", label: "Dossiers", icone: "dossiers" });
  if (oui("ecoles", true)) operations.push({ href: "/ecoles", label: "Écoles", icone: "ecoles" });
  if (oui("traductions", voitTraductions(role))) operations.push({ href: "/traductions", label: "Traductions", icone: "traductions" });

  const finance: Lien[] = [];
  if (oui("devis", peutDevis(role))) finance.push({ href: "/facturation", label: "Devis", icone: "devis" });
  if (oui("factures", peutFacturer(role))) finance.push({ href: "/facturation?vue=factures", label: "Factures", icone: "facture" });
  if (oui("caisse", peutEncaisser(role))) finance.push({ href: "/caisse", label: "Caisse", icone: "caisse" });
  if (oui("creances", voitFinance(role))) finance.push({ href: "/creances", label: "Créances", icone: "creances" });
  if (oui("depenses", voitDepenses(role))) finance.push({ href: "/depenses", label: "Dépenses", icone: "depenses" });
  if (oui("comptabilite", voitCompta(role))) finance.push({ href: "/comptabilite", label: "Comptabilité", icone: "comptabilite" });

  const ressources: Lien[] = [];
  if (oui("messagerie", true)) ressources.push({ href: "/messages", label: "Messagerie", icone: "messages" });
  if (oui("conges", true)) ressources.push({ href: "/conges", label: "Congés et absences", icone: "conges" });
  if (oui("inventaire", peutInventaire(role))) ressources.push({ href: "/inventaire", label: "Inventaire", icone: "inventaire" });
  if (oui("notifications", true)) ressources.push({ href: "/notifications", label: "SMS et alertes", icone: "sms" });

  const administration: Lien[] = ongletsParametres(role, modules).length > 0 ? [{ href: "/parametres", label: "Paramètres", icone: "parametres" }] : [];

  return [
    { titre: "Pilotage", liens: filtrerLiens(pilotage, modules) },
    { titre: "Commercial", liens: filtrerLiens(commercial, modules) },
    { titre: "Opérations", liens: filtrerLiens(operations, modules) },
    { titre: "Finance", liens: filtrerLiens(finance, modules) },
    { titre: "Ressources", liens: filtrerLiens(ressources, modules) },
    { titre: "Administration", liens: administration },
  ].filter((section) => section.liens.length > 0);
}
