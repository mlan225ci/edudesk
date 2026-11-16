import type { Prisma, Role } from "@prisma/client";
import type { AccesEffectif } from "@/server/acces";
import { lienAutorise, type ModulesActifs } from "@/server/modules";

export type SessionUser = {
  id: string;
  prenom: string;
  nom: string;
  email: string;
  telephone: string;
  role: Role;
  autresRoles: Role[];
  actif: boolean;
  partenaireId: string | null;
};

/** Un rôle seul, ou un compte avec rôle principal et rôles additionnels. */
export type PorteurRoles = Role | { role: Role; autresRoles?: readonly Role[] | null };

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

export function rolesEffectifs(porteur: PorteurRoles): Role[] {
  if (typeof porteur === "string") return [porteur];
  return [...new Set([porteur.role, ...(porteur.autresRoles ?? [])])];
}

export function aLeRole(porteur: PorteurRoles, ...candidats: Role[]) {
  const roles = rolesEffectifs(porteur);
  return candidats.some((role) => roles.includes(role));
}

export function unDesRoles(porteur: PorteurRoles, candidats: Iterable<Role>) {
  const cherche = new Set(candidats);
  return rolesEffectifs(porteur).some((role) => cherche.has(role));
}

/** Filtre Prisma : utilisateurs dont le rôle principal ou un rôle additionnel est dans la liste. */
export function filtreParRoles(roles: Role[]): Prisma.UserWhereInput {
  return { OR: [{ role: { in: roles } }, { autresRoles: { hasSome: roles } }] };
}

export function voitDepenses(porteur: PorteurRoles) {
  return unDesRoles(porteur, DEPENSES);
}

export function peutAnnulerDepense(porteur: PorteurRoles) {
  return aLeRole(porteur, "CEO", "ADMINISTRATEUR", "COMPTABLE");
}

export function voitPartenaires(porteur: PorteurRoles) {
  return unDesRoles(porteur, PARTENAIRES);
}

export function peutInventaire(porteur: PorteurRoles) {
  return unDesRoles(porteur, INVENTAIRE);
}

export function peutModifierMontant(porteur: PorteurRoles) {
  return unDesRoles(porteur, MONTANTS);
}

export function peutValiderConges(porteur: PorteurRoles) {
  return aLeRole(porteur, "CEO", "ADMINISTRATEUR");
}

export function voitRapports(porteur: PorteurRoles) {
  return aLeRole(porteur, "CEO", "ADMINISTRATEUR", "COMPTABLE");
}

export function voitTousLesDossiers(porteur: PorteurRoles) {
  return rolesEffectifs(porteur).some((role) => role !== "PARTENAIRE");
}

export function voitFinance(porteur: PorteurRoles) {
  return unDesRoles(porteur, FINANCE);
}

export function voitCompta(porteur: PorteurRoles) {
  return aLeRole(porteur, "CEO", "ADMINISTRATEUR", "COMPTABLE");
}

export function peutProspects(porteur: PorteurRoles) {
  return unDesRoles(porteur, PROSPECTS);
}

export function peutProcedures(porteur: PorteurRoles) {
  return unDesRoles(porteur, PROCEDURES);
}

export function estProduction(porteur: PorteurRoles) {
  return aLeRole(porteur, "INFORMATICIEN_VISA", "INFORMATICIEN_ECOLE", "INFORMATICIEN_FRANCE");
}

export function chargeEtape(porteur: PorteurRoles, roles: string) {
  const liste = roles.split(",").filter(Boolean) as Role[];
  const effectifs = rolesEffectifs(porteur);
  if (effectifs.some((role) => liste.includes(role))) return true;
  return aLeRole(porteur, "INFORMATICIEN_FRANCE") && liste.includes("INFORMATICIEN_ECOLE");
}

export function peutEcoles(porteur: PorteurRoles) {
  return unDesRoles(porteur, PROCEDURES) || aLeRole(porteur, "INFORMATICIEN_ECOLE", "INFORMATICIEN_FRANCE");
}

export function peutCandidatures(porteur: PorteurRoles) {
  return rolesEffectifs(porteur).some((role) => role !== "PARTENAIRE" && role !== "COMPTABLE" && role !== "MOYENS_GENERAUX");
}

export function voitDirection(porteur: PorteurRoles) {
  return unDesRoles(porteur, DIRECTION);
}

export function peutHistorique(porteur: PorteurRoles) {
  return aLeRole(porteur, "CEO");
}

export function peutSigner(porteur: PorteurRoles) {
  return aLeRole(porteur, "CEO", "ADMINISTRATEUR");
}

export function peutArchiverClient(porteur: PorteurRoles) {
  return aLeRole(porteur, "CEO", "ADMINISTRATEUR");
}

export function peutAttribuerClient(porteur: PorteurRoles) {
  return aLeRole(porteur, "CEO", "ADMINISTRATEUR", "RESPONSABLE_COMMERCIALE");
}

export function peutEncaisser(porteur: PorteurRoles) {
  return unDesRoles(porteur, ENCAISSER);
}

export function peutReaffecter(porteur: PorteurRoles) {
  return unDesRoles(porteur, REAFFECTER);
}

export function peutGererEquipe(porteur: PorteurRoles) {
  return unDesRoles(porteur, EQUIPE);
}

export function peutParametrer(porteur: PorteurRoles) {
  return aLeRole(porteur, "CEO", "ADMINISTRATEUR");
}

export function peutDevis(porteur: PorteurRoles) {
  return rolesEffectifs(porteur).some((role) => role !== "COMMUNITY_MANAGER" && (FINANCE.has(role) || PROSPECTS.has(role)));
}

export function peutFacturer(porteur: PorteurRoles) {
  return unDesRoles(porteur, FINANCE);
}

export function peutAnnulerFacture(porteur: PorteurRoles) {
  return aLeRole(porteur, "CEO", "ADMINISTRATEUR", "COMPTABLE");
}

export function voitTraductions(porteur: PorteurRoles) {
  return aLeRole(porteur, "TRADUCTEUR", "CEO", "ADMINISTRATEUR", "ASSISTANTE_ADMINISTRATIVE", "RESPONSABLE_COMMERCIALE");
}

export function peutTraduire(porteur: PorteurRoles) {
  return aLeRole(porteur, "TRADUCTEUR", "CEO", "ADMINISTRATEUR");
}

function filtrerLiens(liens: Lien[], modules?: ModulesActifs) {
  return liens.filter((lien) => lienAutorise(lien.href, modules));
}

export function ongletsParametres(porteur: PorteurRoles, modules?: ModulesActifs): Lien[] {
  if (!peutParametrer(porteur)) return [];
  const onglets: Lien[] = [
    { href: "/parametres/entreprise", label: "Entreprise", icone: "entreprise" },
    { href: "/parametres/documents", label: "Devis et factures", icone: "facturation" },
    { href: "/parametres/procedures", label: "Procédures", icone: "procedures" },
    { href: "/parametres/equipe", label: "Utilisateurs", icone: "equipe" },
    { href: "/parametres/acces", label: "Accès", icone: "acces" },
    { href: "/parametres/securite", label: "Sécurité", icone: "securite" },
    { href: "/parametres/sms", label: "SMS", icone: "sms" },
    { href: "/parametres/email", label: "E-mail", icone: "email" },
    { href: "/parametres/automatisation", label: "Automatisation", icone: "automatisation" },
    { href: "/parametres/comptabilite", label: "Comptabilité", icone: "comptabilite" },
    { href: "/parametres/fonctionnalites", label: "Fonctionnalités", icone: "modules" },
  ];
  return filtrerLiens(onglets, modules);
}

export function peutCloturer(user: SessionUser, etape: { responsableId: string | null; roles: string }) {
  if (aLeRole(user, "CEO", "ADMINISTRATEUR")) return true;
  if (etape.responsableId === user.id) return true;
  return chargeEtape(user, etape.roles);
}

export function peutPiece(user: SessionUser, etape: { responsableId: string | null; roles: string }) {
  if (aLeRole(user, "ASSISTANTE_ADMINISTRATIVE")) return true;
  return peutCloturer(user, etape);
}

export type Lien = { href: string; label: string; icone: string };
export type SectionNavigation = { titre: string; liens: Lien[] };

export function peutCreerClient(porteur: PorteurRoles) {
  return unDesRoles(porteur, PROSPECTS) || aLeRole(porteur, "ASSISTANTE_ADMINISTRATIVE");
}

export function actionsRapides(porteur: PorteurRoles, modules?: ModulesActifs, droits?: AccesEffectif): Lien[] {
  if (typeof porteur !== "string" && porteur.role === "PARTENAIRE" && !(porteur.autresRoles?.length)) return [];
  if (typeof porteur === "string" && porteur === "PARTENAIRE") return [];
  const oui = (id: keyof AccesEffectif, sinon: boolean) => (droits ? droits[id] : sinon);
  const actions: Lien[] = [];
  if (oui("prospects", peutProspects(porteur))) actions.push({ href: "/prospects?nouveau=1", label: "Prospect", icone: "prospects" });
  if (oui("clients", peutCreerClient(porteur))) actions.push({ href: "/clients?nouveau=1", label: "Client et dossier", icone: "clients" });
  if (oui("devis", peutDevis(porteur))) actions.push({ href: "/facturation?nouveau=devis", label: "Devis", icone: "devis" });
  if (oui("factures", peutFacturer(porteur))) actions.push({ href: "/facturation?vue=factures&nouveau=facture", label: "Facture", icone: "facture" });
  if (oui("caisse", peutEncaisser(porteur))) actions.push({ href: "/caisse", label: "Encaissement", icone: "caisse" });
  if (oui("depenses", voitDepenses(porteur))) actions.push({ href: "/depenses?nouveau=1", label: "Dépense", icone: "depenses" });
  if (oui("conges", true)) actions.push({ href: "/conges?nouveau=1", label: "Demande d'absence", icone: "conges" });
  return filtrerLiens(actions, modules);
}

export function navigation(porteur: PorteurRoles, modules?: ModulesActifs, droits?: AccesEffectif): SectionNavigation[] {
  const oui = (id: keyof AccesEffectif, sinon: boolean) => (droits ? droits[id] : sinon);
  const principal = typeof porteur === "string" ? porteur : porteur.role;
  if (principal === "PARTENAIRE") {
    const liens: Lien[] = [];
    if (oui("dossiers", true)) liens.push({ href: "/dossiers", label: "Mes clients", icone: "dossiers" });
    if (oui("notifications", true)) liens.push({ href: "/notifications", label: "Notifications", icone: "sms" });
    return [{ titre: "Espace partenaire", liens: filtrerLiens(liens, modules) }].filter((section) => section.liens.length > 0);
  }

  const pilotage: Lien[] = [{ href: "/tableau-de-bord", label: "Tableau de bord", icone: "tableau" }];
  if (oui("direction", voitDirection(porteur))) pilotage.push({ href: "/direction", label: "Direction", icone: "direction" });
  if (oui("historique", peutHistorique(porteur))) pilotage.push({ href: "/historique", label: "Historique", icone: "historique" });
  if (oui("rapports", voitRapports(porteur))) pilotage.push({ href: "/rapports", label: "Rapports", icone: "rapports" });

  const commercial: Lien[] = [];
  if (oui("prospects", peutProspects(porteur))) commercial.push({ href: "/prospects", label: "Prospects", icone: "prospects" });
  if (oui("clients", true)) commercial.push({ href: "/clients", label: "Clients", icone: "clients" });
  if (oui("partenaires", voitPartenaires(porteur))) commercial.push({ href: "/partenaires", label: "Partenaires", icone: "partenaires" });

  const operations: Lien[] = [];
  if (oui("missions", true)) operations.push({ href: "/missions", label: "Mes missions", icone: "missions" });
  if (oui("dossiers", true)) operations.push({ href: "/dossiers", label: "Dossiers", icone: "dossiers" });
  if (oui("ecoles", true)) operations.push({ href: "/ecoles", label: "Écoles", icone: "ecoles" });
  if (oui("traductions", voitTraductions(porteur))) operations.push({ href: "/traductions", label: "Traductions", icone: "traductions" });

  const finance: Lien[] = [];
  if (oui("devis", peutDevis(porteur))) finance.push({ href: "/facturation", label: "Devis", icone: "devis" });
  if (oui("factures", peutFacturer(porteur))) finance.push({ href: "/facturation?vue=factures", label: "Factures", icone: "facture" });
  if (oui("caisse", peutEncaisser(porteur))) finance.push({ href: "/caisse", label: "Caisse", icone: "caisse" });
  if (oui("creances", voitFinance(porteur))) finance.push({ href: "/creances", label: "Créances", icone: "creances" });
  if (oui("depenses", voitDepenses(porteur))) finance.push({ href: "/depenses", label: "Dépenses", icone: "depenses" });
  if (oui("comptabilite", voitCompta(porteur))) finance.push({ href: "/comptabilite", label: "Comptabilité", icone: "comptabilite" });

  const ressources: Lien[] = [];
  if (oui("messagerie", true)) ressources.push({ href: "/messages", label: "Messagerie", icone: "messages" });
  if (oui("conges", true)) ressources.push({ href: "/conges", label: "Congés et absences", icone: "conges" });
  if (oui("inventaire", peutInventaire(porteur))) ressources.push({ href: "/inventaire", label: "Inventaire", icone: "inventaire" });
  if (oui("notifications", true)) ressources.push({ href: "/notifications", label: "SMS et alertes", icone: "sms" });

  const administration: Lien[] = ongletsParametres(porteur, modules).length > 0 ? [{ href: "/parametres", label: "Paramètres", icone: "parametres" }] : [];

  return [
    { titre: "Pilotage", liens: filtrerLiens(pilotage, modules) },
    { titre: "Commercial", liens: filtrerLiens(commercial, modules) },
    { titre: "Opérations", liens: filtrerLiens(operations, modules) },
    { titre: "Finance", liens: filtrerLiens(finance, modules) },
    { titre: "Ressources", liens: filtrerLiens(ressources, modules) },
    { titre: "Administration", liens: administration },
  ].filter((section) => section.liens.length > 0);
}
