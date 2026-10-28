import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { AlarmClock, ArrowRight, CheckCircle2, ListChecks, PhoneCall, Share2 } from "lucide-react";
import { prisma } from "@/lib/db";
import { delaiTexte, nomComplet } from "@/lib/format";
import { aLeDroit } from "@/server/acces";
import { requireUser } from "@/server/session";
import { Avatar, Badge, EnTete, Vide } from "@/components/ui";
import type { Ton } from "@/components/ui";

export const metadata = { title: "Mes missions" };

export default async function MissionsPage() {
  const user = await requireUser();
  if (user.role === "PARTENAIRE") {
    return (
      <section className="grid gap-6">
        <EnTete titre="Espace partenaire" description="Vos clients et l'avancement de leurs dossiers." icone={ListChecks} />
        <Link href="/dossiers" className="bouton w-fit">
          Voir mes clients <ArrowRight size={16} />
        </Link>
      </section>
    );
  }

  const fin = new Date();
  fin.setUTCHours(23, 59, 59, 999);
  const voitRappels = await aLeDroit(user, "prospects");
  const [etapes, relances] = await Promise.all([
    prisma.dossierEtape.findMany({
      where: { statut: "EN_COURS", responsableId: user.id },
      include: { dossier: { include: { client: true, procedure: true } }, taches: true, pieces: true },
    }),
    voitRappels
      ? prisma.prospect.findMany({
          where: { converti: false, relanceLe: { lte: fin }, ...(user.role === "COMMERCIAL" ? { creeParId: user.id } : {}) },
          orderBy: { relanceLe: "asc" },
        })
      : Promise.resolve([]),
  ]);
  const maintenant = Date.now();
  const parEcheance = (a: { limiteLe: Date | null }, b: { limiteLe: Date | null }) =>
    (a.limiteLe?.getTime() ?? Number.MAX_SAFE_INTEGER) - (b.limiteLe?.getTime() ?? Number.MAX_SAFE_INTEGER);
  const enRetard = etapes.filter((etape) => etape.limiteLe != null && etape.limiteLe.getTime() < maintenant).sort(parEcheance);
  const aTraiter = etapes.filter((etape) => etape.limiteLe == null || etape.limiteLe.getTime() >= maintenant).sort(parEcheance);

  if (etapes.length === 0 && relances.length === 0) {
    return (
      <section className="grid gap-8">
        <EnTete
          titre="Mes missions"
          icone={ListChecks}
          description="Les étapes qui vous sont confiées, rangées par urgence. Ouvrez une carte pour la traiter dans le dossier."
        />
        <Vide icone={CheckCircle2} titre="Tout est à jour" texte="Aucune étape ne vous est confiée pour le moment. Les nouvelles missions apparaîtront ici et par SMS." />
      </section>
    );
  }

  return (
    <section className="grid gap-8">
      <EnTete
        titre="Mes missions"
        icone={ListChecks}
        description="Les étapes qui vous sont confiées, rangées par urgence. Ouvrez une carte pour la traiter dans le dossier."
        actions={
          <div className="flex gap-2">
            <Badge ton="mission" point>{etapes.length} en cours</Badge>
            {enRetard.length ? <Badge ton="cap" point>{enRetard.length} en retard</Badge> : null}
          </div>
        }
      />

      <div className={`grid items-start gap-4 ${voitRappels ? "lg:grid-cols-3" : "lg:grid-cols-2"}`}>
        <Colonne titre="En retard" icone={AlarmClock} ton="cap" compte={enRetard.length} vide="Aucun retard.">
          {enRetard.map((etape) => (
            <CarteEtape key={etape.id} etape={etape} maintenant={maintenant} />
          ))}
        </Colonne>
        <Colonne titre="À traiter" icone={ListChecks} ton="mission" compte={aTraiter.length} vide="Rien à traiter pour le moment.">
          {aTraiter.map((etape) => (
            <CarteEtape key={etape.id} etape={etape} maintenant={maintenant} />
          ))}
        </Colonne>
        {voitRappels ? (
          <Colonne titre="À rappeler" icone={PhoneCall} ton="edu" compte={relances.length} vide="Aucun rappel aujourd'hui.">
            {relances.map((prospect) => (
              <Link key={prospect.id} href={`/prospects/${prospect.id}`} className="carte carte-lien flex items-center gap-3 py-3.5">
                <Avatar prenom={prospect.prenom} nom={prospect.nom} />
                <div className="min-w-0">
                  <p className="truncate font-semibold">{nomComplet(prospect)}</p>
                  <p className="text-xs text-ink/50">{prospect.telephone}</p>
                </div>
              </Link>
            ))}
          </Colonne>
        ) : null}
      </div>
    </section>
  );
}

function Colonne({
  titre,
  icone: Icone,
  ton,
  compte,
  vide,
  children,
}: {
  titre: string;
  icone: LucideIcon;
  ton: Ton;
  compte: number;
  vide: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col rounded-2xl bg-ink/[0.03] p-3">
      <header className="mb-3 flex items-center justify-between gap-2 px-1">
        <h2 className="flex items-center gap-2 text-sm font-bold">
          <Icone size={16} className={ton === "cap" ? "text-cap" : ton === "edu" ? "text-edu" : "text-mission"} />
          {titre}
        </h2>
        <Badge ton={compte ? ton : "gris"}>{compte}</Badge>
      </header>
      <div className="grid gap-3">
        {children}
        {compte === 0 ? <p className="px-2 py-8 text-center text-sm text-ink/40">{vide}</p> : null}
      </div>
    </section>
  );
}

function CarteEtape({
  etape,
  maintenant,
}: {
  etape: {
    id: string;
    titre: string;
    limiteLe: Date | null;
    delegation: boolean;
    taches: { faite: boolean }[];
    pieces: { recue: boolean }[];
    dossier: { id: string; reference: string; client: { prenom: string; nom: string }; procedure: { destination: string } };
  };
  maintenant: number;
}) {
  const retard = etape.limiteLe != null && etape.limiteLe.getTime() < maintenant;
  const faites = etape.taches.filter((tache) => tache.faite).length + etape.pieces.filter((piece) => piece.recue).length;
  const total = etape.taches.length + etape.pieces.length;
  const ratio = total ? Math.round((faites / total) * 100) : 0;
  return (
    <Link
      href={`/dossiers/${etape.dossier.id}`}
      className={`carte carte-lien group relative block overflow-hidden border-l-4 ${retard ? "border-l-cap" : etape.delegation ? "border-l-deleg" : "border-l-mission"}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar prenom={etape.dossier.client.prenom} nom={etape.dossier.client.nom} />
          <div className="min-w-0">
            <p className="truncate font-semibold">{nomComplet(etape.dossier.client)}</p>
            <p className="truncate text-xs text-ink/50">{etape.dossier.reference} · {etape.dossier.procedure.destination}</p>
          </div>
        </div>
        {retard ? (
          <Badge ton="cap"><AlarmClock size={12} /> {delaiTexte(etape.limiteLe)}</Badge>
        ) : (
          <Badge ton="gris">{delaiTexte(etape.limiteLe)}</Badge>
        )}
      </div>
      <p className="mt-4 text-[15px] font-semibold">{etape.titre}</p>
      <div className="mt-3 flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink/[0.06]">
          <div className="h-full origin-left animate-pousse rounded-full bg-desk" style={{ width: `${ratio}%` }} />
        </div>
        <span className="text-xs font-medium text-ink/50">{faites}/{total} éléments</span>
      </div>
      <div className="mt-4 flex items-center justify-between text-xs">
        {etape.delegation ? (
          <span className="inline-flex items-center gap-1 font-semibold text-deleg"><Share2 size={13} /> Délégation</span>
        ) : (
          <span />
        )}
        <span className="inline-flex items-center gap-1 font-semibold text-desk opacity-0 transition group-hover:opacity-100">
          Traiter <ArrowRight size={14} />
        </span>
      </div>
    </Link>
  );
}
