export type Effet = "SUITE" | "RELANCE" | "BOUCLE";
export type Acompte = "DOSSIER" | "SCOLARITE" | "FRAIS";
export type Jalon = "CONTRAT" | "DECISION" | "DEPART";

export type EtapeDef = {
  titre: string;
  delaiHeures: number | null;
  roles: string[];
  acompte?: Acompte;
  jalon?: Jalon;
  choixEcole?: boolean;
  taches: { libelle: string; obligatoire: boolean }[];
  pieces?: { libelle: string; obligatoire: boolean }[];
  issues?: { libelle: string; effet: Effet }[];
};

export type ProcedureDef = {
  code: string;
  nom: string;
  destination: string;
  actif: boolean;
  ecoles?: boolean;
  etapes: EtapeDef[];
};

const t = (libelle: string, obligatoire = true) => ({ libelle, obligatoire });
const p = (libelle: string, obligatoire = true) => ({ libelle, obligatoire });

export const PROCEDURES: ProcedureDef[] = [
  {
    code: "IRLANDE",
    nom: "Études Irlande",
    destination: "Irlande",
    actif: true,
    ecoles: true,
    etapes: [
      {
        titre: "Conseil et orientation",
        delaiHeures: 72,
        roles: ["COMMERCIAL", "RESPONSABLE_COMMERCIALE"],
        taches: [
          t("Écoute et compréhension du profil"),
          t("Information sur les services"),
          t("Orientation et réponses aux questions"),
        ],
      },
      {
        titre: "Vidéo d'information et signature du contrat",
        delaiHeures: null,
        roles: ["COMMERCIAL", "ADMINISTRATEUR"],
        acompte: "DOSSIER",
        jalon: "CONTRAT",
        taches: [t("Visionnage de la vidéo d'information"), t("Signature du contrat")],
        pieces: [p("Contrat signé")],
      },
      {
        titre: "Réception des pièces",
        delaiHeures: 120,
        roles: ["ASSISTANTE_ADMINISTRATIVE"],
        taches: [t("Vérifier la liste"), t("Confirmer la réception"), t("Saisir le nouveau client")],
        pieces: [p("Passeport"), p("Diplômes"), p("Acte de naissance"), p("Photos d'identité")],
      },
      {
        titre: "Candidature",
        delaiHeures: 120,
        roles: ["INFORMATICIEN_ECOLE"],
        taches: [t("Monter le dossier"), t("Envoyer le dossier à l'école d'anglais")],
      },
      {
        titre: "Traduction des documents",
        delaiHeures: 48,
        roles: ["TRADUCTEUR"],
        taches: [t("Traduire les documents transmis à l'école"), t("Marquer la traduction comme certifiée")],
      },
      {
        titre: "Admission",
        delaiHeures: 120,
        roles: ["INFORMATICIEN_ECOLE"],
        choixEcole: true,
        taches: [t("Recevoir l'admission de l'école"), t("Transmettre l'admission")],
        pieces: [p("Lettre d'admission")],
      },
      {
        titre: "Paiement de l'acompte de scolarité",
        delaiHeures: null,
        roles: ["RESPONSABLE_COMMERCIALE"],
        acompte: "SCOLARITE",
        taches: [
          t("Réceptionner le paiement"),
          t("Transmettre le paiement à l'école"),
          t("Transmettre la lettre d'admission définitive"),
        ],
        pieces: [p("Lettre d'admission définitive")],
      },
      {
        titre: "Réception des documents du garant",
        delaiHeures: 120,
        roles: ["CEO", "ASSISTANTE_ADMINISTRATIVE"],
        taches: [t("Recevoir les documents financiers"), t("Vérifier et valider")],
        pieces: [p("Justificatifs financiers du garant"), p("Pièce d'identité du garant")],
      },
      {
        titre: "Traduction des documents du garant",
        delaiHeures: 48,
        roles: ["TRADUCTEUR"],
        taches: [t("Traduction certifiée des documents du garant")],
      },
      {
        titre: "Envoi du dossier au Nigéria",
        delaiHeures: 48,
        roles: ["INFORMATICIEN_VISA", "ASSISTANTE_ADMINISTRATIVE"],
        taches: [
          t("Compiler le dossier complet"),
          t("Signature du client avant envoi", false),
          t("Envoi par FedEx et numéro de suivi noté"),
        ],
      },
      {
        titre: "Visa",
        delaiHeures: null,
        roles: ["RESPONSABLE_COMMERCIALE", "INFORMATICIEN_VISA"],
        taches: [t("Réponse de l'ambassade reçue"), t("Relance mensuelle du candidat", false)],
      },
      {
        titre: "Visa accepté ou refusé",
        delaiHeures: null,
        roles: ["RESPONSABLE_COMMERCIALE", "ADMINISTRATEUR"],
        jalon: "DECISION",
        taches: [t("Informer le candidat de la décision"), t("Si accepté : vidéo « visa à faire » transmise", false)],
        pieces: [p("Décision de l'ambassade", false)],
        issues: [
          { libelle: "Visa accepté", effet: "SUITE" },
          { libelle: "Visa refusé", effet: "RELANCE" },
        ],
      },
      {
        titre: "Départ et suivi",
        delaiHeures: null,
        roles: ["CEO"],
        jalon: "DEPART",
        taches: [t("Réponse à l'école"), t("Recherche de logement"), t("Accueil et installation en Irlande"), t("Suivi après l'arrivée")],
      },
    ],
  },
  {
    code: "CANADA",
    nom: "Études Canada",
    destination: "Canada",
    actif: true,
    ecoles: true,
    etapes: [
      {
        titre: "Conseil et orientation",
        delaiHeures: 72,
        roles: ["COMMERCIAL", "RESPONSABLE_COMMERCIALE"],
        taches: [t("Écoute du profil"), t("Information sur les services"), t("Orientation")],
      },
      {
        titre: "Vidéo d'information et signature du contrat",
        delaiHeures: null,
        roles: ["ADMINISTRATEUR"],
        acompte: "DOSSIER",
        jalon: "CONTRAT",
        taches: [t("Visionnage de la vidéo"), t("Signature du contrat")],
        pieces: [p("Contrat signé")],
      },
      {
        titre: "Réception des pièces",
        delaiHeures: 120,
        roles: ["ASSISTANTE_ADMINISTRATIVE"],
        taches: [t("Vérifier la liste"), t("Confirmer la réception")],
        pieces: [p("Passeport"), p("Diplômes"), p("Relevés de notes")],
      },
      {
        titre: "Analyse et proposition école et formation",
        delaiHeures: 120,
        roles: ["INFORMATICIEN_ECOLE"],
        taches: [t("Analyser le profil"), t("Proposer des écoles et formations au Canada")],
      },
      {
        titre: "Montage du dossier école",
        delaiHeures: 120,
        roles: ["INFORMATICIEN_ECOLE", "TRADUCTEUR"],
        taches: [t("Préparer le CV"), t("Préparer la lettre de motivation"), t("Traduire les pièces"), t("Soumettre le dossier")],
      },
      {
        titre: "Test et admission",
        delaiHeures: null,
        roles: ["INFORMATICIEN_ECOLE", "COACH"],
        choixEcole: true,
        taches: [t("Inscrire au test IELTS ou TEF"), t("Suivre le passage du test"), t("Recevoir l'admission")],
        pieces: [p("Résultat du test"), p("Lettre d'admission")],
      },
      {
        titre: "Paiement de l'acompte de scolarité",
        delaiHeures: null,
        roles: ["RESPONSABLE_COMMERCIALE", "CEO"],
        acompte: "SCOLARITE",
        taches: [t("Réceptionner le paiement"), t("Transmettre à l'école"), t("Transmettre la lettre d'admission définitive")],
      },
      {
        titre: "Réception des documents du garant",
        delaiHeures: 120,
        roles: ["ASSISTANTE_ADMINISTRATIVE"],
        taches: [t("Envoyer la liste"), t("Réceptionner"), t("Valider")],
        pieces: [p("Documents financiers du garant")],
      },
      {
        titre: "Procédure CAQ ou LAP",
        delaiHeures: 120,
        roles: ["INFORMATICIEN_VISA"],
        taches: [t("Constituer le dossier"), t("Soumettre en ligne"), t("Suivre et réceptionner le CAQ ou la LAP")],
        pieces: [p("CAQ ou LAP")],
      },
      {
        titre: "Dossier visa",
        delaiHeures: 336,
        roles: ["INFORMATICIEN_VISA", "ASSISTANTE_ADMINISTRATIVE", "CEO"],
        taches: [t("Constituer le dossier"), t("Vérifier"), t("Soumettre")],
      },
      {
        titre: "Rendez-vous biométrie",
        delaiHeures: null,
        roles: ["ASSISTANTE_ADMINISTRATIVE"],
        taches: [t("Prendre le rendez-vous"), t("Collecter le retour de biométrie")],
      },
      {
        titre: "Visite médicale et dépôt du passeport",
        delaiHeures: null,
        roles: ["RESPONSABLE_COMMERCIALE", "INFORMATICIEN_VISA"],
        taches: [t("Organiser la visite médicale"), t("Déposer le passeport à l'OIM")],
      },
      {
        titre: "Retrait du visa",
        delaiHeures: 240,
        roles: ["COMMUNITY_MANAGER", "ASSISTANTE_ADMINISTRATIVE"],
        jalon: "DECISION",
        taches: [t("Réceptionner l'enveloppe FedEx"), t("Ouvrir l'enveloppe"), t("Si accepté : vidéo « visa à réaliser »", false)],
        issues: [
          { libelle: "Visa accepté", effet: "SUITE" },
          { libelle: "Visa refusé", effet: "RELANCE" },
        ],
      },
      {
        titre: "Départ et suivi",
        delaiHeures: null,
        roles: ["RESPONSABLE_COMMERCIALE", "CEO"],
        jalon: "DEPART",
        taches: [t("Logement"), t("Billet d'avion"), t("Accueil et accompagnement"), t("Suivi après l'arrivée")],
      },
    ],
  },
  {
    code: "FRANCE_PUBLIC",
    nom: "Études France public",
    destination: "France public",
    actif: true,
    ecoles: true,
    etapes: [
      {
        titre: "Campagne",
        delaiHeures: 1440,
        roles: ["RESPONSABLE_COMMERCIALE", "COMMERCIAL"],
        taches: [t("Passage dans les établissements"), t("Fiche explicative remise"), t("Formulaire rempli avec les parents")],
      },
      {
        titre: "Réception des documents",
        delaiHeures: 720,
        roles: ["INFORMATICIEN_VISA", "INFORMATICIEN_ECOLE", "ASSISTANTE_ADMINISTRATIVE"],
        taches: [t("Fournir la liste"), t("Relancer les manquants"), t("Confirmer les documents signés")],
        pieces: [p("Passeport"), p("Bulletins"), p("Acte de naissance")],
      },
      {
        titre: "Analyse et proposition",
        delaiHeures: 168,
        roles: ["INFORMATICIEN_ECOLE", "ASSISTANTE_ADMINISTRATIVE"],
        taches: [t("Analyser le profil"), t("Proposer des écoles publiques"), t("Envoyer les propositions aux parents")],
      },
      {
        titre: "Amendement et choix définitif",
        delaiHeures: 168,
        roles: ["COACH", "INFORMATICIEN_ECOLE", "ASSISTANTE_ADMINISTRATIVE"],
        taches: [t("Présenter et amender"), t("Enregistrer le choix définitif"), t("Débuter le coaching")],
        pieces: [p("Lettre d'engagement signée par les parents")],
      },
      {
        titre: "Montage du dossier et coaching",
        delaiHeures: 720,
        roles: ["INFORMATICIEN_ECOLE", "COACH"],
        taches: [t("Soumettre à Campus France"), t("Coaching entretien et motivation")],
      },
      {
        titre: "Paiement des frais Campus France",
        delaiHeures: 336,
        roles: ["RESPONSABLE_COMMERCIALE", "ASSISTANTE_ADMINISTRATIVE"],
        acompte: "FRAIS",
        taches: [t("Réceptionner les frais"), t("Payer à la banque"), t("Remettre le reçu au parent"), t("Transmettre la quittance à Campus France")],
      },
      {
        titre: "Entretien Campus France",
        delaiHeures: 240,
        roles: ["COACH", "INFORMATICIEN_ECOLE"],
        taches: [t("Valider le rendez-vous avec le coach"), t("Donner les derniers conseils"), t("Recueillir le retour d'expérience")],
      },
      {
        titre: "Attente des réponses des écoles",
        delaiHeures: null,
        roles: ["INFORMATICIEN_VISA", "INFORMATICIEN_ECOLE", "ASSISTANTE_ADMINISTRATIVE"],
        taches: [t("Suivre les réponses"), t("Envoyer la fiche d'évaluation au parent")],
      },
      {
        titre: "Admission",
        delaiHeures: null,
        roles: ["ASSISTANTE_ADMINISTRATIVE", "ADMINISTRATEUR"],
        jalon: "DECISION",
        acompte: "DOSSIER",
        choixEcole: true,
        taches: [t("Réceptionner la lettre d'admission"), t("Faire signer le contrat")],
        pieces: [p("Lettre d'admission"), p("Contrat signé")],
        issues: [
          { libelle: "Admission obtenue", effet: "SUITE" },
          { libelle: "Aucune admission", effet: "RELANCE" },
        ],
      },
      {
        titre: "Procédure de visa",
        delaiHeures: 240,
        roles: ["ASSISTANTE_ADMINISTRATIVE"],
        taches: [t("Passage à Campus France"), t("Constituer le dossier visa")],
      },
      {
        titre: "Documents école et garantie",
        delaiHeures: 336,
        roles: ["INFORMATICIEN_VISA", "INFORMATICIEN_ECOLE", "ASSISTANTE_ADMINISTRATIVE"],
        taches: [t("Réunir les documents de logement"), t("Vérifier la garantie"), t("Prendre le rendez-vous")],
        pieces: [p("Attestation de logement"), p("Garantie financière")],
      },
      {
        titre: "Visa",
        delaiHeures: null,
        roles: ["RESPONSABLE_COMMERCIALE"],
        jalon: "DECISION",
        taches: [t("Enregistrer la décision de visa"), t("Si accordé : vidéo visa transmise", false)],
        issues: [
          { libelle: "Visa accordé", effet: "SUITE" },
          { libelle: "Visa refusé", effet: "RELANCE" },
        ],
      },
      {
        titre: "Départ",
        delaiHeures: null,
        roles: ["RESPONSABLE_COMMERCIALE", "CEO"],
        jalon: "DEPART",
        taches: [t("Réserver le billet"), t("Tenir la séance d'information"), t("Assurer le suivi")],
      },
    ],
  },
  {
    code: "FRANCE_PRIVE",
    nom: "Études France privé",
    destination: "France privé",
    actif: true,
    ecoles: true,
    etapes: [
      {
        titre: "Conseil et orientation",
        delaiHeures: 72,
        roles: ["COMMERCIAL", "RESPONSABLE_COMMERCIALE"],
        taches: [t("Écoute du profil"), t("Information sur les services"), t("Orientation")],
      },
      {
        titre: "Vidéo d'information et signature du contrat",
        delaiHeures: null,
        roles: ["ADMINISTRATEUR", "COMMUNITY_MANAGER"],
        acompte: "DOSSIER",
        jalon: "CONTRAT",
        taches: [t("Visionnage de la vidéo"), t("Signature du contrat")],
        pieces: [p("Contrat signé")],
      },
      {
        titre: "Réception des pièces",
        delaiHeures: 120,
        roles: ["ASSISTANTE_ADMINISTRATIVE"],
        taches: [t("Vérifier la liste"), t("Confirmer la réception")],
        pieces: [p("Passeport"), p("Diplômes"), p("Relevés de notes"), p("Photos d'identité")],
      },
      {
        titre: "Analyse et proposition",
        delaiHeures: 168,
        roles: ["INFORMATICIEN_ECOLE", "ASSISTANTE_ADMINISTRATIVE"],
        taches: [t("Analyser le profil"), t("Proposer des écoles privées"), t("Envoyer les propositions aux parents")],
      },
      {
        titre: "Montage du dossier école et coaching",
        delaiHeures: null,
        roles: ["INFORMATICIEN_ECOLE", "COACH"],
        taches: [t("Préparer CV et lettre de motivation"), t("Soumettre à l'école"), t("Mener le coaching")],
      },
      {
        titre: "Admission et paiement de l'acompte",
        delaiHeures: null,
        roles: ["INFORMATICIEN_ECOLE", "RESPONSABLE_COMMERCIALE"],
        acompte: "SCOLARITE",
        choixEcole: true,
        taches: [
          t("Recevoir l'admission"),
          t("Réceptionner l'acompte"),
          t("Transmettre à l'école"),
          t("Transmettre la lettre d'admission définitive"),
        ],
        pieces: [p("Lettre d'admission définitive")],
      },
      {
        titre: "Montage du dossier Campus France",
        delaiHeures: 72,
        roles: ["INFORMATICIEN_ECOLE", "COACH"],
        taches: [t("Constituer le dossier"), t("Vérifier"), t("Soumettre")],
      },
      {
        titre: "Entretien Campus France",
        delaiHeures: 336,
        roles: ["ASSISTANTE_ADMINISTRATIVE", "COACH"],
        taches: [t("Prendre le rendez-vous"), t("Tenir l'entretien"), t("Alerter le coach avant l'entretien")],
      },
      {
        titre: "Dossier visa",
        delaiHeures: null,
        roles: ["INFORMATICIEN_VISA", "INFORMATICIEN_ECOLE", "ASSISTANTE_ADMINISTRATIVE"],
        taches: [t("Monter le dossier visa"), t("Vérifier le logement"), t("Prendre rendez-vous au centre de visa")],
      },
      {
        titre: "Décision de visa",
        delaiHeures: null,
        roles: ["RESPONSABLE_COMMERCIALE", "ADMINISTRATEUR"],
        jalon: "DECISION",
        taches: [t("Enregistrer la décision"), t("Si accepté : vidéo visa transmise", false)],
        issues: [
          { libelle: "Visa accepté", effet: "SUITE" },
          { libelle: "Visa refusé", effet: "RELANCE" },
        ],
      },
      {
        titre: "Départ et suivi",
        delaiHeures: null,
        roles: ["CEO"],
        jalon: "DEPART",
        taches: [t("Préparer le départ"), t("Assurer le suivi après l'arrivée")],
      },
    ],
  },
  {
    code: "RP",
    nom: "Résidence permanente",
    destination: "Résidence permanente",
    actif: true,
    etapes: [
      {
        titre: "Conseil et orientation",
        delaiHeures: 72,
        roles: ["COMMERCIAL", "RESPONSABLE_COMMERCIALE"],
        taches: [t("Comprendre les besoins"), t("Présenter les services"), t("Orienter")],
      },
      {
        titre: "Signature du contrat",
        delaiHeures: null,
        roles: ["RESPONSABLE_COMMERCIALE", "ADMINISTRATEUR", "COMMUNITY_MANAGER"],
        acompte: "DOSSIER",
        jalon: "CONTRAT",
        taches: [t("Faire signer le contrat"), t("Encaisser l'acompte"), t("Ouvrir le dossier"), t("Transmettre la vidéo explicative")],
        pieces: [p("Contrat signé")],
      },
      {
        titre: "Évaluation du profil",
        delaiHeures: 48,
        roles: ["COACH_RP"],
        taches: [t("Simuler le test TCF"), t("Confirmer la procédure")],
      },
      {
        titre: "Réception des pièces",
        delaiHeures: 96,
        roles: ["INFORMATICIEN_ECOLE", "ASSISTANTE_ADMINISTRATIVE"],
        taches: [t("Transmettre la liste"), t("Classer et vérifier la conformité")],
        pieces: [p("Passeport"), p("Diplômes"), p("Preuves d'expérience")],
      },
      {
        titre: "Coaching TCF et soumission WES",
        delaiHeures: 2160,
        roles: ["INFORMATICIEN_VISA", "COACH_RP"],
        taches: [t("Coacher le candidat"), t("Soumettre et envoyer le dossier WES")],
      },
      {
        titre: "Application",
        delaiHeures: 1440,
        roles: ["INFORMATICIEN_VISA", "COACH_RP"],
        taches: [t("Inscrire et prendre le rendez-vous TCF"), t("Réceptionner le WES"), t("Partager les retours d'expérience"), t("Rendre le verdict")],
      },
      {
        titre: "Soumission du bassin",
        delaiHeures: 72,
        roles: ["ASSISTANTE_ADMINISTRATIVE", "INFORMATICIEN_VISA"],
        taches: [t("Vérification finale"), t("Créer le profil et soumettre"), t("Communiquer le nombre de points")],
      },
      {
        titre: "Tirage du bassin",
        delaiHeures: 720,
        roles: ["INFORMATICIEN_VISA", "ASSISTANTE_ADMINISTRATIVE"],
        jalon: "DECISION",
        taches: [t("Surveiller le bassin"), t("Si invitation : liste complète des documents envoyée au candidat", false)],
        issues: [
          { libelle: "Invitation reçue", effet: "SUITE" },
          { libelle: "Aucune invitation : mise à jour du profil, suivi du bassin", effet: "BOUCLE" },
          { libelle: "Abandon du candidat", effet: "RELANCE" },
        ],
      },
      {
        titre: "Soumission de la demande de visa",
        delaiHeures: 120,
        roles: ["INFORMATICIEN_VISA", "ASSISTANTE_ADMINISTRATIVE"],
        taches: [t("Soumettre officiellement la demande")],
      },
      {
        titre: "Biométrie",
        delaiHeures: 1008,
        roles: ["ASSISTANTE_ADMINISTRATIVE"],
        taches: [t("Prendre le rendez-vous"), t("Collecter les données")],
      },
      {
        titre: "Dépôt de passeport",
        delaiHeures: null,
        roles: ["ASSISTANTE_ADMINISTRATIVE"],
        taches: [t("Réceptionner les documents"), t("Déposer le passeport"), t("Retirer le passeport"), t("Suivre la vidéo visa")],
      },
      {
        titre: "Départ",
        delaiHeures: null,
        roles: ["INFORMATICIEN_ECOLE", "CEO"],
        jalon: "DEPART",
        taches: [t("Billet et logement"), t("Recherche de travail"), t("Séances d'information")],
      },
    ],
  },
  {
    code: "VISITEUR",
    nom: "Visa visiteur",
    destination: "Visiteur",
    actif: true,
    etapes: [
      {
        titre: "Conseil et orientation",
        delaiHeures: 72,
        roles: ["COMMERCIAL", "RESPONSABLE_COMMERCIALE"],
        taches: [t("Écoute du projet de voyage"), t("Choix du pays : Irlande, France, Espagne ou Schengen"), t("Information sur les services")],
      },
      {
        titre: "Vidéo d'information et signature du contrat",
        delaiHeures: null,
        roles: ["ADMINISTRATEUR", "COMMUNITY_MANAGER"],
        acompte: "DOSSIER",
        jalon: "CONTRAT",
        taches: [t("Visionnage de la vidéo"), t("Signature du contrat")],
        pieces: [p("Contrat signé")],
      },
      {
        titre: "Réception des pièces",
        delaiHeures: 120,
        roles: ["ASSISTANTE_ADMINISTRATIVE"],
        taches: [t("Envoyer la liste"), t("Vérifier et confirmer la réception")],
        pieces: [
          p("Passeport"),
          p("Photos d'identité"),
          p("Relevés bancaires"),
          p("Attestation de travail ou d'activité"),
          p("Réservation d'hôtel ou attestation d'accueil"),
          p("Réservation du billet d'avion", false),
        ],
      },
      {
        titre: "Traduction des documents",
        delaiHeures: 48,
        roles: ["TRADUCTEUR"],
        taches: [t("Traduction certifiée des documents", false)],
      },
      {
        titre: "Dossier visa",
        delaiHeures: 120,
        roles: ["INFORMATICIEN_VISA", "ASSISTANTE_ADMINISTRATIVE"],
        taches: [t("Remplir le formulaire de demande"), t("Vérifier le dossier complet"), t("Prendre le rendez-vous au centre de visa")],
      },
      {
        titre: "Rendez-vous biométrie et dépôt",
        delaiHeures: null,
        roles: ["ASSISTANTE_ADMINISTRATIVE"],
        taches: [t("Préparer le candidat au rendez-vous"), t("Dépôt du dossier et biométrie effectués")],
      },
      {
        titre: "Visa accepté ou refusé",
        delaiHeures: null,
        roles: ["RESPONSABLE_COMMERCIALE", "ADMINISTRATEUR"],
        jalon: "DECISION",
        taches: [t("Retrait du passeport"), t("Informer le candidat de la décision")],
        issues: [
          { libelle: "Visa accepté", effet: "SUITE" },
          { libelle: "Visa refusé", effet: "RELANCE" },
        ],
      },
      {
        titre: "Départ et suivi",
        delaiHeures: null,
        roles: ["RESPONSABLE_COMMERCIALE", "CEO"],
        jalon: "DEPART",
        taches: [t("Conseils de départ"), t("Suivi du séjour", false)],
      },
    ],
  },
];

export const MODELES_SMS: { code: string; libelle: string; corps: string }[] = [
  {
    code: "mission",
    libelle: "Mission collaborateur",
    corps: "EDUDESK mission: {{client}} / {{destination}} / {{etape}}. Delai: {{delai}}.",
  },
  {
    code: "client_ouverture",
    libelle: "Client, ouverture du dossier",
    corps: "EDUDESK: {{prenom}}, votre dossier {{reference}} ({{destination}}) est ouvert. Code de suivi: {{code}}. Suivez-le sur {{lien}}",
  },
  {
    code: "client_etape",
    libelle: "Client, étape franchie",
    corps: "EDUDESK: {{prenom}}, votre dossier {{destination}} passe a l'etape \"{{etape}}\".",
  },
  {
    code: "client_admission",
    libelle: "Client, admission obtenue",
    corps: "EDUDESK: {{prenom}}, bonne nouvelle ! Admission obtenue a {{ecole}}{{formation}}. Suivi: {{lien}}",
  },
  {
    code: "client_visa",
    libelle: "Client, visa accepté",
    corps: "EDUDESK: {{prenom}}, visa accepte pour {{destination}}. Consigne visa a suivre.",
  },
  {
    code: "client_relance",
    libelle: "Client, point à planifier",
    corps: "EDUDESK: {{prenom}}, un point est a planifier sur votre dossier {{destination}}.",
  },
  {
    code: "client_reorientation",
    libelle: "Client, réorientation",
    corps: "EDUDESK: {{prenom}}, votre dossier est reoriente vers {{destination}}.",
  },
  {
    code: "partenaire",
    libelle: "Partenaire, avancement",
    corps: "EDUDESK: votre client {{client}} ({{destination}}) est a l'etape \"{{etape}}\".",
  },
  {
    code: "j1",
    libelle: "Alerte veille d'échéance",
    corps: "EDUDESK J-1: {{client}} / {{etape}} arrive a echeance.",
  },
  {
    code: "retard",
    libelle: "Alerte retard",
    corps: "EDUDESK retard: {{client}} / {{etape}}. Echeance depassee.",
  },
  {
    code: "sans_responsable",
    libelle: "Dossier sans responsable",
    corps: "EDUDESK: dossier {{reference}} sans responsable a l'etape \"{{etape}}\".",
  },
  {
    code: "relance_interne",
    libelle: "Rendez-vous administrateur",
    corps: "EDUDESK: planifier un RDV administrateur pour {{client}} ({{destination}}).",
  },
  {
    code: "paiement",
    libelle: "Paiement enregistré",
    corps: "EDUDESK: paiement {{montant}} XOF ({{mode}}) enregistre. Facture {{facture}}.",
  },
];
