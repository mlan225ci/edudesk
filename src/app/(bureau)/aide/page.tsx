import Link from "next/link";
import { CircleHelp } from "lucide-react";
import { EnTete } from "@/components/ui";

export const metadata = { title: "Aide" };

const CHAPITRES = [
  {
    id: "connexion",
    titre: "Connexion",
    page: "/login",
    pageLabel: "Ouvrir la connexion",
    image: "/aide/connexion.png",
    alt: "Page de connexion EduDesk",
    texte: "Chaque collaborateur entre avec son adresse et son mot de passe. Après cinq échecs, le compte reste fermé pendant quinze minutes. Les raccourcis de démonstration n'apparaissent pas sur le site en ligne.",
  },
  {
    id: "tableau",
    titre: "Tableau de bord",
    page: "/tableau-de-bord",
    pageLabel: "Ouvrir le tableau de bord",
    image: "/aide/tableau.png",
    alt: "Tableau de bord avec les indicateurs du jour",
    texte: "La page d'accueil résume la journée : missions, prospects à rappeler, paiements à rapprocher, encaissements, dépenses, trésorerie, dossiers ouverts et étapes en retard. Ctrl K retrouve un client, un dossier ou une page.",
  },
  {
    id: "direction",
    titre: "Direction",
    page: "/direction",
    pageLabel: "Ouvrir la direction",
    image: "/aide/direction.png",
    alt: "Vue direction : acquisition, retards et entonnoir",
    texte: "La direction voit les dossiers actifs, les étapes en retard, l'encaissement du jour et les commissions partenaires. Le bloc Acquisition indique, source par source, combien de prospects sont devenus clients. Le bouton de relance envoie un SMS pour les retards.",
  },
  {
    id: "prospects",
    titre: "Prospects",
    page: "/prospects",
    pageLabel: "Ouvrir les prospects",
    image: "/aide/prospects.png",
    alt: "Pipeline des prospects en colonnes",
    texte: "Un prospect avance de Premier contact jusqu'au Paiement, en glissant la carte ou avec le menu Déplacer. Le téléphone et l'e-mail déjà connus ne créent pas de fiche en double. Les onglets listent aussi les relances, les contacts sans action depuis sept jours et les convertis.",
  },
  {
    id: "clients",
    titre: "Clients",
    page: "/clients",
    pageLabel: "Ouvrir les clients",
    image: "/aide/clients.png",
    alt: "Liste des clients et de leur dernier dossier",
    texte: "La recherche accepte le nom, le prénom, le téléphone, le numéro de dossier, le pays ou la procédure. La fiche d'un client indique depuis quand il est suivi, le jour où il est devenu client et la personne qui l'a converti.",
  },
  {
    id: "dossiers",
    titre: "Dossiers",
    page: "/dossiers",
    pageLabel: "Ouvrir les dossiers",
    image: "/aide/dossiers.png",
    alt: "Liste des dossiers avec statut, étape et retard",
    texte: "Chaque ligne montre la destination, le statut, l'étape en cours, l'avancement et le retard. On filtre par étape, par destination, ou on ne garde que les dossiers en retard.",
  },
  {
    id: "dossier",
    titre: "Fiche d'un dossier",
    page: "/dossiers",
    pageLabel: "Ouvrir un dossier",
    image: "/aide/dossier.png",
    alt: "Dossier avec la signature du contrat et l'étape en cours",
    texte: "La fiche suit les étapes de la procédure. L'étape en cours liste ce qu'il reste à faire. Les pièces se classent par catégorie ; un nouveau dépôt conserve la version précédente. Une pièce signalée manquante place le dossier en attente et envoie au client la liste exacte par SMS. Seuls la direction et l'administrateur signent le contrat. Le code de suivi, affiché à droite, est celui que le client utilise.",
  },
  {
    id: "missions",
    titre: "Missions",
    page: "/missions",
    pageLabel: "Ouvrir mes missions",
    image: "/aide/missions.png",
    alt: "Missions rangées en retard, à traiter et à rappeler",
    texte: "Mes missions rassemble ce qui est confié à la personne connectée : étapes en retard, étapes à traiter, prospects à rappeler. Une carte ouvre directement le dossier ou le prospect.",
  },
  {
    id: "factures",
    titre: "Factures",
    page: "/facturation?vue=factures",
    pageLabel: "Ouvrir les factures",
    image: "/aide/factures.png",
    alt: "Liste des factures et reçus",
    texte: "Chaque encaissement produit une facture et un reçu. Les factures d'acompte d'ouverture et de frais de procédure portent la mention Non remboursable. La scolarité n'est pas marquée ainsi. Les filtres séparent factures, reçus et statuts de règlement.",
  },
  {
    id: "caisse",
    titre: "Caisse",
    page: "/caisse",
    pageLabel: "Ouvrir la caisse",
    image: "/aide/caisse.png",
    alt: "Formulaire d'encaissement et journal du jour",
    texte: "On choisit le dossier, la nature du paiement et le montant. Le règlement se fait en espèces, par virement ou en mobile money, avec une précision libre. La facture et l'écriture comptable sont créées en même temps. Depuis un dossier, le bouton Encaisser préremplit le client et le reste à payer.",
  },
  {
    id: "notifications",
    titre: "Notifications",
    page: "/notifications",
    pageLabel: "Ouvrir les notifications",
    image: "/aide/notifications.png",
    alt: "Liste des notifications internes",
    texte: "La cloche compte les messages non lus. Ouvrir cette page les marque comme lus et le compteur disparaît. Les onglets Journal SMS et Journal e-mails gardent l'historique des envois. Un nouveau dossier, un changement d'étape, un retard ou une pièce reçue préviennent la personne chargée de la suite.",
  },
  {
    id: "messages",
    titre: "Messagerie",
    page: "/messages",
    pageLabel: "Ouvrir la messagerie",
    image: "/aide/messages.png",
    alt: "Groupe Équipe EduDesk et conversations entre collègues",
    texte: "Sans conversation choisie, le groupe de toute l'équipe est ouvert. Les échanges déjà ouverts restent en haut de la liste. On écrit à un collègue, on joint un fichier ou une note vocale. @ cite une personne, # cite un dossier.",
  },
  {
    id: "contact",
    titre: "Formulaire public",
    page: "/contact",
    pageLabel: "Ouvrir le formulaire",
    image: "/aide/contact.png",
    alt: "Formulaire public Parler à EduDesk",
    texte: "La page /contact est ouverte sans compte. La personne laisse son nom, son téléphone et son projet. Si le numéro ou l'e-mail existe déjà, aucune fiche en double n'est créée. Le prospect arrive chez la responsable commerciale.",
  },
  {
    id: "suivi",
    titre: "Suivi client",
    page: "/suivi",
    pageLabel: "Ouvrir le suivi",
    image: "/aide/suivi.png",
    alt: "Page publique de suivi avec le code reçu par SMS",
    texte: "Le client n'a pas de compte. À l'ouverture du dossier, il reçoit un code par SMS. Sur /suivi, ce code montre l'avancement, les pièces et les paiements. Le secrétariat peut renvoyer le code depuis la fiche du dossier.",
  },
] as const;

const AUSSI = [
  { href: "/ecoles", label: "Écoles" },
  { href: "/traductions", label: "Traductions" },
  { href: "/partenaires", label: "Partenaires" },
  { href: "/creances", label: "Créances" },
  { href: "/depenses", label: "Dépenses" },
  { href: "/comptabilite", label: "Comptabilité" },
  { href: "/conges", label: "Congés" },
  { href: "/inventaire", label: "Inventaire" },
  { href: "/rapports", label: "Rapports" },
  { href: "/historique", label: "Historique" },
  { href: "/parametres", label: "Paramètres" },
];

export default function PageAide() {
  return (
    <div className="space-y-8">
      <EnTete
        icone={CircleHelp}
        titre="Aide"
        description="Parcours de démonstration, page par page, avec les écrans tels qu'ils apparaissent dans l'application."
      />

      <nav aria-label="Sommaire" className="flex flex-wrap gap-2">
        {CHAPITRES.map((chapitre) => (
          <a key={chapitre.id} href={`#${chapitre.id}`} className="rounded-full bg-white px-3 py-1.5 text-sm font-medium text-ink/80 ring-1 ring-ink/10 transition hover:bg-ink hover:text-white">
            {chapitre.titre}
          </a>
        ))}
      </nav>

      {CHAPITRES.map((chapitre) => (
        <section key={chapitre.id} id={chapitre.id} className="scroll-mt-24 space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0 max-w-3xl">
              <h2 className="text-lg font-bold">{chapitre.titre}</h2>
              <p className="mt-1 text-sm leading-6 text-ink/65">{chapitre.texte}</p>
            </div>
            <Link href={chapitre.page} className="shrink-0 text-sm font-semibold text-desk hover:underline">
              {chapitre.pageLabel}
            </Link>
          </div>
          <img src={chapitre.image} alt={chapitre.alt} className="w-full rounded-2xl border border-ink/10 bg-white shadow-sm" />
        </section>
      ))}

      <section className="rounded-2xl border border-ink/10 bg-white p-5">
        <h2 className="text-lg font-bold">Les autres pages</h2>
        <p className="mt-1 text-sm leading-6 text-ink/65">
          Selon le profil, le menu affiche aussi ces espaces. Les paramètres, les accès et l'historique complet sont réservés à la direction et à l'administrateur.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {AUSSI.map((lien) => (
            <Link key={lien.href} href={lien.href} className="rounded-full bg-paper px-3 py-1.5 text-sm font-medium text-ink/80 ring-1 ring-ink/10 transition hover:bg-ink hover:text-white">
              {lien.label}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
