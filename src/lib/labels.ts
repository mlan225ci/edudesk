import type {
  AcompteExige,
  CategorieDepense,
  EtatMateriel,
  ModePaiement,
  Role,
  SourceProspect,
  StatutCandidature,
  StatutConge,
  StatutDossier,
  TypeConge,
  TypePaiement,
} from "@prisma/client";
import { xof } from "@/lib/format";

export const ROLES: { value: Role; label: string }[] = [
  { value: "CEO", label: "Direction" },
  { value: "ADMINISTRATEUR", label: "Administrateur" },
  { value: "RESPONSABLE_COMMERCIALE", label: "Responsable commerciale" },
  { value: "COMMERCIAL", label: "Commercial" },
  { value: "ASSISTANTE_ADMINISTRATIVE", label: "Assistante administrative" },
  { value: "INFORMATICIEN_VISA", label: "Informaticien visa" },
  { value: "INFORMATICIEN_ECOLE", label: "Informaticien école" },
  { value: "COACH", label: "Coach" },
  { value: "COACH_RP", label: "Coach RP" },
  { value: "TRADUCTEUR", label: "Traducteur" },
  { value: "COMMUNITY_MANAGER", label: "Community manager" },
  { value: "COMPTABLE", label: "Comptable" },
  { value: "MOYENS_GENERAUX", label: "Moyens généraux" },
  { value: "PARTENAIRE", label: "Partenaire local" },
];

export function labelRole(role: Role) {
  return ROLES.find((item) => item.value === role)?.label ?? role;
}

export function labelRoles(roles: string) {
  return roles
    .split(",")
    .filter(Boolean)
    .map((role) => labelRole(role as Role))
    .join(", ");
}

export const ACTIONS_AUDIT: Record<string, string> = {
  OUVERTURE: "Dossier ouvert",
  CONVERSION: "Prospect converti",
  CLIENT: "Client créé",
  CLOTURE_ETAPE: "Étape clôturée",
  PAIEMENT: "Encaissement",
  DEPENSE: "Dépense saisie",
  DEPENSE_ANNULEE: "Dépense annulée",
  PIECE_RECUE: "Pièce reçue",
  PIECE_CONSULTEE: "Document consulté",
  REAFFECTATION: "Réaffectation",
  RELANCE: "Mise en relance",
  REORIENTATION: "Réorientation",
  BOUCLE: "Étape reprise",
  MATERIEL: "Matériel ajouté",
  MONTANT_CONVENU: "Montant convenu modifié",
  TACHE_FAITE: "Tâche faite",
  TACHE_REPRISE: "Tâche rouverte",
  DELAI: "Échéance modifiée",
  CONTRAT_REQUIS: "Contrat et acompte exigés",
  CODE_SUIVI: "Suivi client",
  PROCEDURE: "Procédure",
  ECOLE: "École",
  CANDIDATURE: "Candidature",
  PARAMETRES: "Paramètres",
};

export const STATUTS_CANDIDATURE: Record<StatutCandidature, string> = {
  PROPOSEE: "Proposée",
  SOUMISE: "Soumise",
  ADMIS: "Admis",
  REFUSE: "Refusée",
  CHOISIE: "École retenue",
  ABANDONNEE: "Abandonnée",
};

export const TON_CANDIDATURE: Record<StatutCandidature, "edu" | "desk" | "mission" | "vert" | "cap" | "gris"> = {
  PROPOSEE: "edu",
  SOUMISE: "desk",
  ADMIS: "vert",
  REFUSE: "cap",
  CHOISIE: "mission",
  ABANDONNEE: "gris",
};

export const TYPES_ECOLE = ["Université publique", "École privée", "Collège", "École de langues", "Grande école"];

export function detailAudit(detail: string) {
  return detail
    .replace(/(?<![\w-])\d{4,}(?![\w-])/g, (montant) => xof(Number(montant)))
    .replace(/\b[A-Z][A-Z_]{3,}\b/g, (code) => MODES.find((mode) => mode.value === code)?.label ?? code);
}

export function estLettreDefinitive(libelle: string) {
  return /d[ée]finitive/i.test(libelle) && /lettre|admission/i.test(libelle);
}

// Comme dans le cahier des charges, l'étape « vidéo d'information et signature du contrat » n'est pas numérotée.
export function numerosEtapes(etapes: { id: string; rang: number; jalon: string | null }[]) {
  const numeros = new Map<string, string>();
  let numero = 0;
  for (const etape of [...etapes].sort((a, b) => a.rang - b.rang)) {
    numeros.set(etape.id, etape.jalon === "CONTRAT" ? "Contrat" : String(++numero));
  }
  return numeros;
}

export const STATUTS: Record<StatutDossier, string> = {
  ORIENTATION: "Orientation",
  EN_COURS: "En cours",
  DECISION: "Décision",
  DEPART_SUIVI: "Départ et suivi",
  RELANCE: "Relance",
  REORIENTE: "Réorienté",
};

export const TON_STATUT: Record<StatutDossier, "edu" | "desk" | "mission" | "vert" | "cap" | "gris"> = {
  ORIENTATION: "edu",
  EN_COURS: "desk",
  DECISION: "mission",
  DEPART_SUIVI: "vert",
  RELANCE: "cap",
  REORIENTE: "gris",
};

export const SOURCES: { value: SourceProspect; label: string }[] = [
  { value: "TERRAIN", label: "Terrain" },
  { value: "RESEAUX_SOCIAUX", label: "Réseaux sociaux" },
  { value: "APPEL", label: "Appel" },
  { value: "APPORTEUR", label: "Apporteur d'affaire" },
  { value: "PARTENAIRE", label: "Partenaire local" },
];

export function labelSource(source: SourceProspect) {
  return SOURCES.find((item) => item.value === source)?.label ?? source;
}

export const MODES: { value: ModePaiement; label: string; compte: string }[] = [
  { value: "ESPECES", label: "Espèces", compte: "571" },
  { value: "VIREMENT", label: "Virement", compte: "521" },
  { value: "MOBILE_MONEY", label: "Mobile money", compte: "558" },
];

export function labelMode(mode: ModePaiement) {
  return MODES.find((item) => item.value === mode)?.label ?? mode;
}

export function compteTresorerie(mode: ModePaiement) {
  return MODES.find((item) => item.value === mode)?.compte ?? "571";
}

export const TYPES_PAIEMENT: { value: TypePaiement; label: string }[] = [
  { value: "ACOMPTE_DOSSIER", label: "Acompte d'ouverture" },
  { value: "ACOMPTE_SCOLARITE", label: "Acompte de scolarité" },
  { value: "FRAIS", label: "Frais de procédure" },
  { value: "AUTRE", label: "Autre encaissement" },
];

export function labelTypePaiement(type: TypePaiement) {
  return TYPES_PAIEMENT.find((item) => item.value === type)?.label ?? type;
}

export function typePourAcompte(acompte: AcompteExige): TypePaiement | null {
  if (acompte === "DOSSIER") return "ACOMPTE_DOSSIER";
  if (acompte === "SCOLARITE") return "ACOMPTE_SCOLARITE";
  if (acompte === "FRAIS") return "FRAIS";
  return null;
}

export const COMPTES: Record<string, string> = {
  "101": "Capital",
  "571": "Caisse",
  "521": "Banque",
  "558": "Mobile money",
  "411": "Clients",
  "706": "Prestations de services",
  "605": "Fournitures",
  "614": "Transport",
  "622": "Loyers",
  "624": "Entretien",
  "627": "Publicité",
  "628": "Télécommunications",
  "631": "Frais bancaires",
  "632": "Commissions",
  "638": "Frais consulaires",
  "641": "Impôts et taxes",
  "658": "Charges diverses",
  "661": "Salaires",
};

export const CATEGORIES_DEPENSE: { value: CategorieDepense; label: string; compte: string }[] = [
  { value: "LOYER", label: "Loyer", compte: "622" },
  { value: "SALAIRES", label: "Salaires", compte: "661" },
  { value: "TRANSPORT", label: "Transport", compte: "614" },
  { value: "TELECOM", label: "Téléphone et internet", compte: "628" },
  { value: "MARKETING", label: "Marketing", compte: "627" },
  { value: "FOURNITURES", label: "Fournitures", compte: "605" },
  { value: "ENTRETIEN", label: "Entretien", compte: "624" },
  { value: "FRAIS_CONSULAIRES", label: "Frais consulaires", compte: "638" },
  { value: "COMMISSION", label: "Commission partenaire", compte: "632" },
  { value: "FRAIS_BANCAIRES", label: "Frais bancaires", compte: "631" },
  { value: "IMPOTS", label: "Impôts et taxes", compte: "641" },
  { value: "AUTRE", label: "Autre dépense", compte: "658" },
];

export function labelCategorie(categorie: CategorieDepense) {
  return CATEGORIES_DEPENSE.find((item) => item.value === categorie)?.label ?? categorie;
}

export function compteCharge(categorie: CategorieDepense) {
  return CATEGORIES_DEPENSE.find((item) => item.value === categorie)?.compte ?? "658";
}

export const ETATS_MATERIEL: { value: EtatMateriel; label: string }[] = [
  { value: "BON", label: "Bon état" },
  { value: "USAGE", label: "Usé" },
  { value: "PANNE", label: "En panne" },
  { value: "REFORME", label: "Réformé" },
];

export function labelEtat(etat: EtatMateriel) {
  return ETATS_MATERIEL.find((item) => item.value === etat)?.label ?? etat;
}

export const TYPES_CONGE: { value: TypeConge; label: string }[] = [
  { value: "CONGE", label: "Congé" },
  { value: "MALADIE", label: "Maladie" },
  { value: "PERMISSION", label: "Permission" },
];

export function labelTypeConge(type: TypeConge) {
  return TYPES_CONGE.find((item) => item.value === type)?.label ?? type;
}

export const STATUTS_CONGE: Record<StatutConge, string> = {
  DEMANDE: "En attente",
  VALIDE: "Validé",
  REFUSE: "Refusé",
};
