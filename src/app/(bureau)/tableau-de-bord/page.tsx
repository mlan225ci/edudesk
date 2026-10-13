import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import type { StatutDossier } from "@prisma/client";
import {
  Activity,
  AlarmClock,
  ArrowDownCircle,
  CalendarCheck,
  CalendarDays,
  ChevronRight,
  FolderOpen,
  FolderPlus,
  Landmark,
  ListChecks,
  PhoneCall,
  PieChart,
  Receipt,
  Scale,
  Target,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { prisma } from "@/lib/db";
import { cleMois, debutJourAbidjan, debutMois, delaiTexte, formatDate, nomComplet, variation, xof, xofCourt } from "@/lib/format";
import { ACTIONS_AUDIT, COMPTES, STATUTS, detailAudit, labelCategorie, labelSource, labelTypeConge } from "@/lib/labels";
import { Anneau, BarresHorizontales, BarresMensuelles, Kpi, Panneau } from "@/components/graphiques";
import { Avatar, Progression } from "@/components/ui";
import { peutProspects, peutValiderConges, voitCompta, voitDirection, voitFinance, type SessionUser } from "@/server/permissions";
import { requireUser } from "@/server/session";
import { COMPTES_TRESORERIE, compterPar, cumulParMois, moisGlissants, situationDossiers, tresorerie } from "@/server/stats";
import {
  chargerAbsents,
  chargerClotures,
  chargerDossiers,
  chargerEtapesEnCours,
  chargerFlux,
  chargerProspects,
} from "@/server/donnees-tableau";

export const metadata = { title: "Tableau de bord" };

const TONS_STATUT: Record<StatutDossier, "edu" | "desk" | "mission" | "vert" | "cap" | "ink"> = {
  ORIENTATION: "edu",
  EN_COURS: "desk",
  DECISION: "mission",
  DEPART_SUIVI: "vert",
  RELANCE: "cap",
  REORIENTE: "ink",
};

const ACTIONS = ACTIONS_AUDIT;

export default async function TableauDeBordPage() {
  const user = await requireUser();
  if (user.role === "PARTENAIRE") redirect("/dossiers");
  const finance = voitFinance(user.role);
  const direction = voitDirection(user.role);
  const heure = Number(
    new Intl.DateTimeFormat("fr-FR", { hour: "numeric", hourCycle: "h23", timeZone: "Africa/Abidjan" })
      .formatToParts(new Date())
      .find((partie) => partie.type === "hour")?.value ?? 12,
  );
  const salut = heure >= 18 || heure < 4 ? "Bonsoir" : heure < 12 ? "Bonjour" : "Bon après-midi";
  const dateLongue = new Intl.DateTimeFormat("fr-FR", { dateStyle: "full", timeZone: "Africa/Abidjan" }).format(new Date());

  return (
    <section className="grid gap-6">
      <header className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-ink via-[#1a3563] to-desk px-6 py-7 text-white shadow-xl shadow-ink/10 md:px-8">
        <div className="pointer-events-none absolute -top-16 -right-10 h-56 w-56 rounded-full bg-edu/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 left-1/3 h-48 w-48 rounded-full bg-deleg/30 blur-3xl" />
        <p className="relative text-sm text-white/60 first-letter:uppercase">{dateLongue}</p>
        <h1 className="relative mt-1 text-2xl font-bold tracking-tight md:text-3xl">
          {salut}, {user.prenom}
        </h1>
        <p className="relative mt-1 text-sm text-white/70">Voici ce qui demande votre attention aujourd'hui.</p>
        <div className="relative mt-5">
          <Suspense fallback={<div className="flex gap-2">{[0, 1, 2].map((i) => <div key={i} className="h-10 w-44 animate-pulse rounded-xl bg-white/10" />)}</div>}>
            <Priorites user={user} />
          </Suspense>
        </div>
      </header>

      {finance ? (
        <Suspense fallback={<SqueletteKpis />}>
          <KpisFinance />
        </Suspense>
      ) : null}

      <Suspense fallback={<SqueletteKpis />}>
        <KpisActivite user={user} />
      </Suspense>

      {finance ? (
        <Suspense fallback={<SqueletteBloc hauteur="h-72" colonnes />}>
          <BlocFinance />
        </Suspense>
      ) : null}

      <Suspense fallback={<SqueletteBloc hauteur="h-56" colonnes />}>
        <BlocRepartition user={user} />
      </Suspense>

      <Suspense fallback={<SqueletteBloc hauteur="h-56" colonnes />}>
        <BlocSuivi user={user} direction={direction} />
      </Suspense>

      <Suspense fallback={<SqueletteBloc hauteur="h-48" colonnes />}>
        <BlocVieInterne finance={finance} />
      </Suspense>
    </section>
  );
}

async function Priorites({ user }: { user: SessionUser }) {
  const maintenant = new Date();
  const finJour = new Date(debutJourAbidjan().getTime() + 864e5);
  const [etapes, prospects, congesAValider, aRapprocher] = await Promise.all([
    chargerEtapesEnCours(),
    peutProspects(user.role) ? chargerProspects() : Promise.resolve([]),
    peutValiderConges(user.role) ? prisma.conge.count({ where: { statut: "DEMANDE" } }) : Promise.resolve(0),
    voitCompta(user.role) ? prisma.paiement.count({ where: { statut: "ENCAISSE" } }) : Promise.resolve(0),
  ]);
  const miennes = etapes.filter((etape) => etape.responsableId === user.id);
  const retards = miennes.filter((etape) => etape.limiteLe && etape.limiteLe < maintenant).length;
  const relances = prospects.filter(
    (prospect) => !prospect.converti && prospect.relanceLe && prospect.relanceLe < finJour && (user.role !== "COMMERCIAL" || prospect.creeParId === user.id),
  ).length;

  const puces = [
    { href: "/missions", icone: ListChecks, texte: `${miennes.length} mission${miennes.length > 1 ? "s" : ""} en cours`, alerte: false },
    ...(retards ? [{ href: "/missions", icone: AlarmClock, texte: `${retards} en retard`, alerte: true }] : []),
    ...(relances ? [{ href: "/prospects?filtre=relance", icone: PhoneCall, texte: `${relances} prospect${relances > 1 ? "s" : ""} à rappeler`, alerte: false }] : []),
    ...(congesAValider ? [{ href: "/conges", icone: CalendarCheck, texte: `${congesAValider} absence${congesAValider > 1 ? "s" : ""} à valider`, alerte: false }] : []),
    ...(aRapprocher ? [{ href: "/comptabilite", icone: Scale, texte: `${aRapprocher} paiement${aRapprocher > 1 ? "s" : ""} à rapprocher`, alerte: false }] : []),
  ];

  return (
    <div className="flex flex-wrap gap-2 entree-cascade">
      {puces.map((puce) => (
        <Link
          key={puce.texte}
          href={puce.href}
          className={`group inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold backdrop-blur transition hover:-translate-y-0.5 ${
            puce.alerte ? "bg-cap text-white shadow-lg shadow-cap/30" : "bg-white/10 text-white hover:bg-white/20"
          }`}
        >
          <puce.icone size={16} />
          {puce.texte}
          <ChevronRight size={15} className="opacity-50 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
        </Link>
      ))}
    </div>
  );
}

async function KpisFinance() {
  const [{ paiements, depenses }, tresor] = await Promise.all([chargerFlux(), tresorerie()]);
  const encaisse = cumulParMois(paiements, (p) => p.dateEncaissement, (p) => p.montant);
  const sorties = cumulParMois(depenses, (d) => d.date, (d) => d.montant);
  const ceMois = cleMois(debutMois(0));
  const avant = cleMois(debutMois(-1));
  const encaisseMois = encaisse.get(ceMois) ?? 0;
  const depenseMois = sorties.get(ceMois) ?? 0;
  const annee = new Date().getUTCFullYear();
  const encaisseAnnee = paiements.filter((p) => p.dateEncaissement.getUTCFullYear() === annee).reduce((somme, p) => somme + p.montant, 0);

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 entree-cascade">
      <Kpi titre="Encaissé ce mois" valeur={encaisseMois} format="xof" evolution={variation(encaisseMois, encaisse.get(avant) ?? 0)} detail="vs mois dernier" ton="desk" icone={Wallet} href="/caisse" />
      <Kpi titre="Dépenses du mois" valeur={depenseMois} format="xof" evolution={variation(depenseMois, sorties.get(avant) ?? 0)} inverse detail="vs mois dernier" ton="mission" icone={ArrowDownCircle} href="/depenses" />
      <Kpi titre="Résultat du mois" valeur={encaisseMois - depenseMois} format="xof" detail={`Encaissé ${annee} : ${xofCourt(encaisseAnnee)}`} ton={encaisseMois - depenseMois >= 0 ? "vert" : "cap"} icone={TrendingUp} href="/rapports" />
      <Kpi titre="Trésorerie disponible" valeur={tresor.total} format="xof" detail="caisse, banque, mobile money" ton="ink" icone={Landmark} href="/comptabilite" />
    </div>
  );
}

async function KpisActivite({ user }: { user: SessionUser }) {
  const [dossiers, prospects, etapes, clotures, clients] = await Promise.all([
    chargerDossiers(),
    chargerProspects(),
    chargerEtapesEnCours(),
    chargerClotures(),
    prisma.client.count(),
  ]);
  const maintenant = new Date();
  const ouverts = cumulParMois(dossiers, (d) => d.ouvertLe, () => 1);
  const ouvertsMois = ouverts.get(cleMois(debutMois(0))) ?? 0;
  const retards = etapes.filter((etape) => etape.limiteLe && etape.limiteLe < maintenant).length;
  const convertis = prospects.filter((p) => p.converti).length;
  const taux = prospects.length ? Math.round((convertis / prospects.length) * 100) : 0;
  const miennes = etapes.filter((etape) => etape.responsableId === user.id);

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 entree-cascade">
      <Kpi titre="Dossiers actifs" valeur={dossiers.filter((d) => d.statut !== "REORIENTE").length} detail={`${clients} clients au total`} icone={FolderOpen} href="/dossiers" />
      <Kpi titre="Ouverts ce mois" valeur={ouvertsMois} evolution={variation(ouvertsMois, ouverts.get(cleMois(debutMois(-1))) ?? 0)} detail="vs mois dernier" ton="desk" icone={FolderPlus} href="/dossiers" />
      <Kpi titre="Étapes en retard" valeur={retards} detail={`${etapes.length} étapes en cours`} ton={retards ? "cap" : "vert"} icone={AlarmClock} href="/dossiers?retard=1" />
      {peutProspects(user.role) || voitDirection(user.role) ? (
        <Kpi titre="Conversion prospects" valeur={taux} format="pourcent" detail={`${convertis} convertis sur ${prospects.length}`} ton="edu" icone={Target} href="/prospects" />
      ) : (
        <Kpi
          titre="Mes clôtures ce mois"
          valeur={clotures.filter((etape) => etape.responsableId === user.id).length}
          detail={`${miennes.length} mission(s) en cours`}
          ton="vert"
          icone={ListChecks}
          href="/missions"
        />
      )}
    </div>
  );
}

async function BlocFinance() {
  const [{ paiements, depenses }, tresor, situation] = await Promise.all([chargerFlux(), tresorerie(), situationDossiers()]);
  const mois = moisGlissants(12);
  const convenu = situation.reduce((somme, ligne) => somme + ligne.convenu, 0);
  const paye = situation.reduce((somme, ligne) => somme + Math.min(ligne.paye, ligne.convenu), 0);
  const reste = situation.reduce((somme, ligne) => somme + ligne.reste, 0);
  const taux = convenu ? Math.round((paye / convenu) * 100) : 0;

  return (
    <div className="grid gap-4 lg:grid-cols-3 entree-cascade">
      <Panneau titre="Encaissements et dépenses · 12 mois" icone={TrendingUp} className="lg:col-span-2" action={{ href: "/rapports", label: "Rapports" }}>
        <BarresMensuelles
          mois={mois}
          series={[
            { nom: "Encaissements", ton: "desk", valeurs: cumulParMois(paiements, (p) => p.dateEncaissement, (p) => p.montant) },
            { nom: "Dépenses", ton: "edu", valeurs: cumulParMois(depenses, (d) => d.date, (d) => d.montant) },
          ]}
        />
      </Panneau>
      <div className="grid gap-4">
        <Panneau titre="Trésorerie" icone={Landmark} action={{ href: "/comptabilite", label: "Détail" }}>
          <BarresHorizontales format="xof" donnees={COMPTES_TRESORERIE.map((compte) => ({ label: COMPTES[compte], valeur: tresor.soldes[compte] ?? 0 }))} />
        </Panneau>
        <Panneau titre="Recouvrement" icone={Receipt} action={{ href: "/creances", label: "Créances" }}>
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-xl font-bold text-cap tabular-nums">{xof(reste)}</p>
              <p className="text-xs text-ink/50">reste à encaisser sur {xofCourt(convenu)}</p>
            </div>
            <p className="text-2xl font-bold">{taux}%</p>
          </div>
          <div className="mt-3">
            <Progression valeur={taux} />
          </div>
        </Panneau>
      </div>
    </div>
  );
}

async function BlocRepartition({ user }: { user: SessionUser }) {
  const [dossiers, prospects] = await Promise.all([chargerDossiers(), chargerProspects()]);
  const actifs = dossiers.filter((d) => d.statut !== "REORIENTE");
  const mois = moisGlissants(12);
  return (
    <div className="grid gap-4 lg:grid-cols-3 entree-cascade">
      <Panneau titre="Dossiers par statut" icone={PieChart} action={{ href: "/dossiers", label: "Tous" }}>
        <Anneau
          centre={String(dossiers.length)}
          sousTitre="dossiers"
          segments={(Object.keys(STATUTS) as StatutDossier[]).map((statut) => ({
            label: STATUTS[statut],
            valeur: dossiers.filter((d) => d.statut === statut).length,
            ton: TONS_STATUT[statut],
            href: `/dossiers?statut=${statut}`,
          }))}
        />
      </Panneau>
      <Panneau titre="Destinations" icone={FolderOpen}>
        <BarresHorizontales donnees={compterPar(actifs, (d) => d.procedure.destination).map(([label, valeur]) => ({ label, valeur }))} vide="Aucun dossier actif." />
      </Panneau>
      {peutProspects(user.role) || voitDirection(user.role) ? (
        <Panneau titre="Origine des prospects" icone={Target} action={{ href: "/prospects", label: "Prospects" }}>
          <BarresHorizontales ton="edu" donnees={compterPar(prospects, (p) => labelSource(p.source)).map(([label, valeur]) => ({ label, valeur }))} vide="Aucun prospect." />
        </Panneau>
      ) : (
        <Panneau titre="Ouvertures · 12 mois" icone={FolderPlus}>
          <BarresMensuelles mois={mois.slice(-6)} series={[{ nom: "Dossiers ouverts", ton: "ink", valeurs: cumulParMois(dossiers, (d) => d.ouvertLe, () => 1) }]} />
        </Panneau>
      )}
    </div>
  );
}

async function BlocSuivi({ user, direction }: { user: SessionUser; direction: boolean }) {
  const maintenant = new Date();
  const [etapes, clotures, collaborateurs] = await Promise.all([
    chargerEtapesEnCours(),
    chargerClotures(),
    direction ? prisma.user.findMany({ where: { actif: true, role: { not: "PARTENAIRE" } } }) : Promise.resolve([]),
  ]);
  const retards = etapes.filter((etape) => etape.limiteLe && etape.limiteLe < maintenant).sort((a, b) => (a.limiteLe?.getTime() ?? 0) - (b.limiteLe?.getTime() ?? 0));
  const miennes = etapes.filter((etape) => etape.responsableId === user.id);
  const charge = collaborateurs
    .map((collaborateur) => {
      const siennes = etapes.filter((etape) => etape.responsableId === collaborateur.id);
      return { collaborateur, total: siennes.length, enRetard: siennes.filter((etape) => etape.limiteLe && etape.limiteLe < maintenant).length };
    })
    .filter((ligne) => ligne.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 7);

  return (
    <div className="grid gap-4 lg:grid-cols-3 entree-cascade">
      <Panneau titre="Mon activité" icone={ListChecks} action={{ href: "/missions", label: "Mes missions" }}>
        <dl className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-2xl bg-mission/10 p-3">
            <dt className="text-[11px] font-medium text-ink/55">En cours</dt>
            <dd className="text-xl font-bold text-mission">{miennes.length}</dd>
          </div>
          <div className="rounded-2xl bg-cap/10 p-3">
            <dt className="text-[11px] font-medium text-ink/55">En retard</dt>
            <dd className="text-xl font-bold text-cap">{miennes.filter((etape) => etape.limiteLe && etape.limiteLe < maintenant).length}</dd>
          </div>
          <div className="rounded-2xl bg-vert/10 p-3">
            <dt className="text-[11px] font-medium text-ink/55">Clôturées</dt>
            <dd className="text-xl font-bold text-vert">{clotures.filter((etape) => etape.responsableId === user.id).length}</dd>
          </div>
        </dl>
        <ul className="mt-4 grid gap-1">
          {miennes.slice(0, 4).map((etape) => (
            <li key={etape.id}>
              <Link href={`/dossiers/${etape.dossier.id}`} className="flex items-center justify-between gap-2 rounded-xl px-2 py-2 text-sm transition hover:bg-paper">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{nomComplet(etape.dossier.client)}</span>
                  <span className="block truncate text-xs text-ink/50">{etape.titre}</span>
                </span>
                <span className={`shrink-0 text-xs font-semibold ${etape.limiteLe && etape.limiteLe < maintenant ? "text-cap" : "text-ink/50"}`}>{delaiTexte(etape.limiteLe)}</span>
              </Link>
            </li>
          ))}
          {miennes.length === 0 ? <li className="py-3 text-center text-sm text-ink/45">Aucune mission en cours.</li> : null}
        </ul>
      </Panneau>

      {direction ? (
        <Panneau titre="Charge de l'équipe" icone={Users} action={{ href: "/direction", label: "Direction" }}>
          <ul className="grid gap-3">
            {charge.map((ligne) => (
              <li key={ligne.collaborateur.id} className="flex items-center gap-3">
                <Avatar prenom={ligne.collaborateur.prenom} nom={ligne.collaborateur.nom} taille="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex justify-between text-sm">
                    <span className="truncate">{nomComplet(ligne.collaborateur)}</span>
                    <span className="font-semibold">
                      {ligne.total}
                      {ligne.enRetard ? <span className="ml-1 text-xs text-cap">· {ligne.enRetard} retard</span> : null}
                    </span>
                  </div>
                  <div className="mt-1">
                    <Progression valeur={(ligne.total / Math.max(charge[0]?.total ?? 1, 1)) * 100} ton={ligne.enRetard ? "cap" : "desk"} />
                  </div>
                </div>
              </li>
            ))}
            {charge.length === 0 ? <li className="py-3 text-center text-sm text-ink/45">Aucune étape en cours.</li> : null}
          </ul>
        </Panneau>
      ) : null}

      <Panneau titre="Étapes en retard" icone={AlarmClock} action={{ href: "/dossiers?retard=1", label: "Tout voir" }} className={direction ? "" : "lg:col-span-2"}>
        <ul className="grid gap-1">
          {retards.slice(0, 5).map((etape) => (
            <li key={etape.id}>
              <Link href={`/dossiers/${etape.dossier.id}`} className="flex items-center justify-between gap-2 rounded-xl px-2 py-2 text-sm transition hover:bg-paper">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{nomComplet(etape.dossier.client)}</span>
                  <span className="block truncate text-xs text-ink/50">{etape.dossier.procedure.destination} · {etape.titre}</span>
                </span>
                <span className="badge shrink-0 bg-cap/10 text-cap">{delaiTexte(etape.limiteLe)}</span>
              </Link>
            </li>
          ))}
          {retards.length === 0 ? <li className="py-6 text-center text-sm text-vert">Aucun retard. Bravo à l'équipe !</li> : null}
        </ul>
      </Panneau>

    </div>
  );
}

function ListeDebiteurs({ debiteurs }: { debiteurs: Awaited<ReturnType<typeof situationDossiers>> }) {
  return (
    <ul className="grid gap-1">
      {debiteurs.map((ligne) => (
        <li key={ligne.dossier.id}>
          <Link href={`/dossiers/${ligne.dossier.id}`} className="flex items-center justify-between gap-2 rounded-xl px-2 py-2 text-sm transition hover:bg-paper">
            <span className="min-w-0 truncate">
              {nomComplet(ligne.dossier.client)} <span className="text-ink/45">· {ligne.dossier.procedure.destination}</span>
            </span>
            <span className="shrink-0 font-semibold tabular-nums">{xof(ligne.reste)}</span>
          </Link>
        </li>
      ))}
      {debiteurs.length === 0 ? <li className="py-3 text-center text-sm text-ink/45">Aucune créance.</li> : null}
    </ul>
  );
}

async function BlocVieInterne({ finance }: { finance: boolean }) {
  const [absents, audits, flux, situation] = await Promise.all([
    chargerAbsents(),
    prisma.audit.findMany({ where: { action: { not: "PIECE_CONSULTEE" } }, orderBy: { creeLe: "desc" }, take: 6, include: { user: true } }),
    finance ? chargerFlux() : Promise.resolve(null),
    finance ? situationDossiers() : Promise.resolve([]),
  ]);
  const ceMois = debutMois(0);
  const parCategorie = new Map<string, number>();
  for (const depense of flux?.depenses.filter((d) => d.date >= ceMois) ?? []) {
    parCategorie.set(labelCategorie(depense.categorie), (parCategorie.get(labelCategorie(depense.categorie)) ?? 0) + depense.montant);
  }
  const debiteurs = situation.filter((ligne) => ligne.reste > 0).sort((a, b) => b.reste - a.reste).slice(0, 5);

  const panneauAbsents = (
    <Panneau titre="Absents aujourd'hui" icone={CalendarDays} action={{ href: "/conges", label: "Planning" }}>
      <ul className="grid gap-2">
        {absents.map((conge) => (
          <li key={conge.id} className="flex items-center gap-3 text-sm">
            <Avatar prenom={conge.user.prenom} nom={conge.user.nom} taille="sm" />
            <span className="flex-1">{nomComplet(conge.user)}</span>
            <span className="badge bg-mission/15 text-[#a35a12]">{labelTypeConge(conge.type)}</span>
          </li>
        ))}
        {absents.length === 0 ? <li className="text-sm text-vert">Toute l'équipe est présente.</li> : null}
      </ul>
    </Panneau>
  );

  if (!finance) {
    return (
      <div className="grid gap-4 lg:grid-cols-3 entree-cascade">
        {panneauAbsents}
        <Panneau titre="Activité récente" icone={Activity} className="lg:col-span-2">
          <Journal audits={audits} colonnes />
        </Panneau>
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3 entree-cascade">
      <Panneau titre="Plus gros restes à payer" icone={Receipt} action={{ href: "/creances", label: "Créances" }}>
        <ListeDebiteurs debiteurs={debiteurs} />
      </Panneau>
      <Panneau titre="Dépenses du mois" icone={ArrowDownCircle} action={{ href: "/depenses", label: "Dépenses" }}>
        <BarresHorizontales ton="edu" format="xof" donnees={[...parCategorie.entries()].sort((a, b) => b[1] - a[1]).map(([label, valeur]) => ({ label, valeur }))} vide="Aucune dépense ce mois." />
      </Panneau>
      {panneauAbsents}
      <Panneau titre="Activité récente" icone={Activity} className="lg:col-span-3">
        <Journal audits={audits} colonnes />
      </Panneau>
    </div>
  );
}

function Journal({
  audits,
  colonnes = false,
}: {
  audits: { id: string; action: string; detail: string | null; creeLe: Date; user: { prenom: string; nom: string } | null }[];
  colonnes?: boolean;
}) {
  return (
    <ul className={`grid gap-3 ${colonnes ? "md:grid-cols-2 xl:grid-cols-3" : ""}`}>
      {audits.map((audit) => (
        <li key={audit.id} className="flex gap-3 text-sm">
          {audit.user ? <Avatar prenom={audit.user.prenom} nom={audit.user.nom} taille="sm" /> : <span className="h-7 w-7 rounded-full bg-ink/10" />}
          <div className="min-w-0">
            <p className="truncate">
              <span className="font-semibold">{ACTIONS[audit.action] ?? audit.action}</span>
              {audit.detail ? <span className="text-ink/55"> · {detailAudit(audit.detail)}</span> : null}
            </p>
            <p className="text-xs text-ink/45">
              {audit.user ? nomComplet(audit.user) : "Système"} · {formatDate(audit.creeLe)}
            </p>
          </div>
        </li>
      ))}
      {audits.length === 0 ? <li className="text-sm text-ink/45">Rien pour l'instant.</li> : null}
    </ul>
  );
}

function SqueletteKpis() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {[0, 1, 2, 3].map((index) => (
        <div key={index} className="carte grid gap-3">
          <div className="squelette h-4 w-28" />
          <div className="squelette h-7 w-40" />
          <div className="squelette h-3 w-24" />
        </div>
      ))}
    </div>
  );
}

function SqueletteBloc({ hauteur, colonnes = false }: { hauteur: string; colonnes?: boolean }) {
  return (
    <div className={`grid gap-4 ${colonnes ? "lg:grid-cols-3" : ""}`}>
      <div className={`carte ${colonnes ? "lg:col-span-2" : ""}`}>
        <div className={`squelette ${hauteur} w-full`} />
      </div>
      {colonnes ? (
        <div className="carte">
          <div className={`squelette ${hauteur} w-full`} />
        </div>
      ) : null}
    </div>
  );
}
