import { cache } from "react";
import { prisma } from "@/lib/db";

export const MODULES = [
  { id: "prospects", groupe: "Commercial", label: "Prospects", icone: "prospects", description: "Suivi des contacts avant qu'ils deviennent clients.", prefixes: ["/prospects"] },
  { id: "partenaires", groupe: "Commercial", label: "Partenaires", icone: "partenaires", description: "Apporteurs d'affaires, commissions et versements.", prefixes: ["/partenaires"] },
  { id: "ecoles", groupe: "Opérations", label: "Écoles et candidatures", icone: "ecoles", description: "Catalogue des écoles et candidatures rattachées aux dossiers.", prefixes: ["/ecoles"] },
  { id: "traductions", groupe: "Opérations", label: "Traductions", icone: "traductions", description: "Demandes de traduction à partir des pièces d'un dossier.", prefixes: ["/traductions", "/api/traductions"] },
  { id: "devis", groupe: "Finance", label: "Devis", icone: "devis", description: "Établissement, envoi et suivi des devis.", prefixes: [] },
  { id: "factures", groupe: "Finance", label: "Factures", icone: "facture", description: "Émission des factures, transformation d'un devis et suivi des règlements.", prefixes: [] },
  { id: "caisse", groupe: "Finance", label: "Caisse", icone: "caisse", description: "Journal de caisse. L'encaissement saisi directement sur un dossier reste disponible.", prefixes: ["/caisse"] },
  { id: "creances", groupe: "Finance", label: "Créances", icone: "creances", description: "Suivi des sommes restant dues.", prefixes: ["/creances"] },
  { id: "depenses", groupe: "Finance", label: "Dépenses", icone: "depenses", description: "Dépenses du bureau.", prefixes: ["/depenses"] },
  { id: "comptabilite", groupe: "Finance", label: "Comptabilité", icone: "comptabilite", description: "Journaux, plan comptable et comptes de trésorerie.", prefixes: ["/comptabilite", "/parametres/comptabilite"] },
  { id: "messagerie", groupe: "Ressources", label: "Messagerie interne", icone: "messages", description: "Messages entre collaborateurs.", prefixes: ["/messages", "/api/messages"] },
  { id: "conges", groupe: "Ressources", label: "Congés et absences", icone: "conges", description: "Demandes d'absence et leur validation.", prefixes: ["/conges"] },
  { id: "inventaire", groupe: "Ressources", label: "Inventaire", icone: "inventaire", description: "Stock et matériel.", prefixes: ["/inventaire"] },
  { id: "direction", groupe: "Pilotage", label: "Direction", icone: "direction", description: "Vue de synthèse : retards, destinations et commissions.", prefixes: ["/direction"] },
  { id: "rapports", groupe: "Pilotage", label: "Rapports", icone: "rapports", description: "Statistiques et exports.", prefixes: ["/rapports", "/api/rapport"] },
  { id: "notifications", groupe: "Communication", label: "Notifications", icone: "sms", description: "Centre des notifications reçues par les collaborateurs.", prefixes: ["/notifications"] },
  { id: "sms", groupe: "Communication", label: "SMS", icone: "sms", description: "Réglage de l'opérateur et des modèles. Les SMS envoyés à l'avancement d'un dossier continuent.", prefixes: ["/parametres/sms"] },
  { id: "automatisation", groupe: "Communication", label: "Automatisation", icone: "automatisation", description: "Relances automatiques la veille d'une échéance et en cas de retard.", prefixes: ["/parametres/automatisation"] },
  { id: "email", groupe: "Communication", label: "E-mail", icone: "email", description: "Réglage du serveur d'envoi. Les messages déjà prévus par les dossiers continuent d'utiliser le serveur enregistré.", prefixes: ["/parametres/email"] },
] as const;

export type ModuleId = (typeof MODULES)[number]["id"];
export type ModulesActifs = Record<ModuleId, boolean>;

const HERITAGES: Partial<Record<ModuleId, string>> = {
  devis: "facturation",
  factures: "facturation",
  notifications: "alertes",
  sms: "alertes",
  automatisation: "alertes",
};

export const lireModules = cache(async function lireModules(): Promise<ModulesActifs> {
  const lignes = await prisma.parametre.findMany({ where: { cle: { startsWith: "modules." } } });
  const valeurs = new Map(lignes.map((ligne) => [ligne.cle.slice("modules.".length), ligne.valeur]));
  return Object.fromEntries(
    MODULES.map((module) => {
      const propre = valeurs.get(module.id);
      const herite = HERITAGES[module.id] ? valeurs.get(HERITAGES[module.id]!) : undefined;
      const valeur = propre ?? herite;
      return [module.id, valeur !== "0"];
    }),
  ) as ModulesActifs;
});

export function moduleDuChemin(chemin: string): ModuleId | null {
  const [cheminNu, recherche = ""] = chemin.split("?");
  const params = new URLSearchParams(recherche);
  if (cheminNu === "/facturation" || cheminNu.startsWith("/facturation/") || /^\/dossiers\/[^/]+\/factures(\/|$)/.test(cheminNu)) {
    const facture = cheminNu.startsWith("/facturation/factures") || /^\/dossiers\/[^/]+\/factures(\/|$)/.test(cheminNu) || params.get("vue") === "factures" || params.get("nouveau") === "facture";
    return facture ? "factures" : "devis";
  }
  let trouve: ModuleId | null = null;
  let longueur = 0;
  for (const module of MODULES) {
    for (const prefixe of module.prefixes) {
      if ((cheminNu === prefixe || cheminNu.startsWith(`${prefixe}/`)) && prefixe.length > longueur) {
        trouve = module.id;
        longueur = prefixe.length;
      }
    }
  }
  return trouve;
}

export function lienAutorise(href: string, modules?: ModulesActifs) {
  if (!modules) return true;
  const chemin = href.split("?")[0] ?? href;
  if (chemin === "/parametres/documents") return modules.devis || modules.factures;
  const id = moduleDuChemin(href);
  return !id || modules[id];
}

export function lienSi(actif: boolean, href: string) {
  return actif ? href : undefined;
}
