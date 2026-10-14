import Link from "next/link";
import { ArrowRight, Settings } from "lucide-react";
import { prisma } from "@/lib/db";
import { formatDate, nomComplet } from "@/lib/format";
import { ACTIONS_AUDIT, COMPTES } from "@/lib/labels";
import { Icone } from "@/components/icones";
import { Badge, EnTete, type Ton } from "@/components/ui";
import { CHAMPS_ENTREPRISE, configMail, configSms, lireEntreprise, urlPublique } from "@/server/parametres";
import { configAutomatisation } from "@/server/automatisation";
import { ongletsParametres } from "@/server/permissions";
import { requireUser } from "@/server/session";

export const metadata = { title: "Paramètres" };

type Carte = { href: string; icone: string; titre: string; texte: string; etat: string; ton: Ton };

export default async function ParametresPage() {
  const user = await requireUser();
  const onglets = new Set(ongletsParametres(user.role).map((onglet) => onglet.href));
  const [entreprise, url, sms, mail, automatisation, procedures, utilisateurs, modeles, ecoles, historique] = await Promise.all([
    lireEntreprise(),
    urlPublique(),
    configSms(),
    configMail(),
    configAutomatisation(),
    prisma.procedure.groupBy({ by: ["actif"], _count: true }),
    prisma.user.count({ where: { actif: true } }),
    prisma.modeleSms.count(),
    prisma.ecole.count({ where: { actif: true } }),
    prisma.audit.findMany({
      where: { action: { in: ["PARAMETRES", "PROCEDURE"] } },
      include: { user: { select: { prenom: true, nom: true } } },
      orderBy: { creeLe: "desc" },
      take: 8,
    }),
  ]);
  const renseignes = CHAMPS_ENTREPRISE.filter((champ) => entreprise[champ]).length;
  const actives = procedures.find((groupe) => groupe.actif)?._count ?? 0;
  const inactives = procedures.find((groupe) => !groupe.actif)?._count ?? 0;

  const cartes: Carte[] = [
    {
      href: "/parametres/entreprise",
      icone: "entreprise",
      titre: "Entreprise",
      texte: "Raison sociale, coordonnées, RCCM et mentions affichées sur les factures et le portail client.",
      etat: `${renseignes}/${CHAMPS_ENTREPRISE.length} informations${url ? "" : " · adresse publique à définir"}`,
      ton: renseignes >= 6 && url ? "vert" : "edu",
    },
    {
      href: "/parametres/procedures",
      icone: "procedures",
      titre: "Procédures",
      texte: "Parcours types : étapes, tâches, pièces, délais, tarifs, commissions et choix de l'école.",
      etat: `${actives} active${actives > 1 ? "s" : ""}${inactives ? ` · ${inactives} en pause ou brouillon` : ""}`,
      ton: "desk",
    },
    {
      href: "/parametres/equipe",
      icone: "equipe",
      titre: "Utilisateurs",
      texte: "Comptes des collaborateurs, rôles, hiérarchie et mots de passe.",
      etat: `${utilisateurs} compte${utilisateurs > 1 ? "s" : ""} actif${utilisateurs > 1 ? "s" : ""}`,
      ton: "desk",
    },
    {
      href: "/parametres/sms",
      icone: "sms",
      titre: "SMS",
      texte: "Opérateur d'envoi, nom d'expéditeur, modèles de messages et envoi de test.",
      etat: sms.url ? `Opérateur branché · ${modeles} modèles` : `Aucun opérateur : SMS journalisés · ${modeles} modèles`,
      ton: sms.url ? "vert" : "cap",
    },
    {
      href: "/parametres/email",
      icone: "email",
      titre: "E-mail",
      texte: "Serveur d'envoi, e-mails aux clients et partenaires, factures et devis en pièce jointe.",
      etat: mail.hote ? `Serveur branché · ${mail.expediteur}` : "Aucun serveur : e-mails journalisés",
      ton: mail.hote ? "vert" : "cap",
    },
    {
      href: "/parametres/automatisation",
      icone: "automatisation",
      titre: "Automatisation",
      texte: "Vérification automatique des échéances : alertes la veille et en cas de retard, renvoi des messages en attente.",
      etat: automatisation.actif ? `Toutes les ${automatisation.minutes} min${automatisation.derniere ? ` · dernier passage ${formatDate(automatisation.derniere)}` : ""}` : "Suspendue",
      ton: automatisation.actif ? "vert" : "cap",
    },
    {
      href: "/parametres/comptabilite",
      icone: "comptabilite",
      titre: "Comptabilité",
      texte: "Plan comptable, comptes de trésorerie par mode de règlement et comptes de charges par dépense.",
      etat: `${Object.keys(COMPTES).length} comptes`,
      ton: "gris",
    },
  ].filter((carte) => onglets.has(carte.href)) as Carte[];

  return (
    <section className="grid gap-6">
      <EnTete
        titre="Paramètres"
        icone={Settings}
        description="Tout ce qui configure EduDesk, regroupé au même endroit. Les changements s'appliquent immédiatement."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 entree-cascade">
        {cartes.map((carte) => (
          <Link key={carte.href} href={carte.href} className="carte carte-lien group grid content-between gap-4">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-desk/[0.07] text-desk">
                <Icone nom={carte.icone} size={19} />
              </span>
              <div className="min-w-0">
                <p className="font-semibold group-hover:text-desk">{carte.titre}</p>
                <p className="mt-0.5 text-sm text-ink/55">{carte.texte}</p>
              </div>
            </div>
            <div className="flex items-center justify-between gap-2">
              <Badge ton={carte.ton} point>{carte.etat}</Badge>
              <ArrowRight size={16} className="text-ink/25 transition group-hover:translate-x-0.5 group-hover:text-desk" />
            </div>
          </Link>
        ))}
        <Link href="/ecoles" className="carte carte-lien group grid content-between gap-4">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-desk/[0.07] text-desk">
              <Icone nom="ecoles" size={19} />
            </span>
            <div className="min-w-0">
              <p className="font-semibold group-hover:text-desk">Catalogue des écoles</p>
              <p className="mt-0.5 text-sm text-ink/55">Écoles proposées aux étudiants, formations, frais et commissions partenaires.</p>
            </div>
          </div>
          <div className="flex items-center justify-between gap-2">
            <Badge ton={ecoles ? "desk" : "edu"} point>{ecoles ? `${ecoles} école${ecoles > 1 ? "s" : ""} active${ecoles > 1 ? "s" : ""}` : "Catalogue vide"}</Badge>
            <ArrowRight size={16} className="text-ink/25 transition group-hover:translate-x-0.5 group-hover:text-desk" />
          </div>
        </Link>
      </div>

      {historique.length > 0 ? (
        <article className="carte">
          <h2 className="font-semibold">Dernières modifications</h2>
          <ul className="mt-3 divide-y divide-ink/[0.05] text-sm">
            {historique.map((ligne) => (
              <li key={ligne.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2.5">
                <span>
                  <span className="font-medium">{ACTIONS_AUDIT[ligne.action] ?? ligne.action}</span>
                  {ligne.detail ? <span className="text-ink/60"> · {ligne.detail}</span> : null}
                </span>
                <span className="text-xs text-ink/45">
                  {ligne.user ? nomComplet(ligne.user) : "Système"} · {formatDate(ligne.creeLe)}
                </span>
              </li>
            ))}
          </ul>
        </article>
      ) : null}
    </section>
  );
}
