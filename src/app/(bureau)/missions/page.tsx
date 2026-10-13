import Link from "next/link";
import { AlarmClock, ArrowRight, CheckCircle2, ListChecks, PhoneCall, Share2 } from "lucide-react";
import { prisma } from "@/lib/db";
import { delaiTexte, nomComplet } from "@/lib/format";
import { peutProspects } from "@/server/permissions";
import { requireUser } from "@/server/session";
import { Avatar, Badge, EnTete, Vide } from "@/components/ui";

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
  const [etapes, relances] = await Promise.all([
    prisma.dossierEtape.findMany({
      where: { statut: "EN_COURS", responsableId: user.id },
      include: { dossier: { include: { client: true, procedure: true } }, taches: true, pieces: true },
    }),
    peutProspects(user.role)
      ? prisma.prospect.findMany({
          where: { converti: false, relanceLe: { lte: fin }, ...(user.role === "COMMERCIAL" ? { creeParId: user.id } : {}) },
          orderBy: { relanceLe: "asc" },
        })
      : Promise.resolve([]),
  ]);
  const maintenant = Date.now();
  const triees = [...etapes].sort((a, b) => {
    const retardA = a.limiteLe && a.limiteLe.getTime() < maintenant ? 0 : 1;
    const retardB = b.limiteLe && b.limiteLe.getTime() < maintenant ? 0 : 1;
    if (retardA !== retardB) return retardA - retardB;
    return (a.limiteLe?.getTime() ?? Number.MAX_SAFE_INTEGER) - (b.limiteLe?.getTime() ?? Number.MAX_SAFE_INTEGER);
  });
  const enRetard = triees.filter((etape) => etape.limiteLe && etape.limiteLe.getTime() < maintenant).length;

  return (
    <section className="grid gap-8">
      <EnTete
        titre="Mes missions"
        icone={ListChecks}
        description="Les étapes de dossier qui vous sont confiées, les plus urgentes en premier. Cliquez sur une carte pour la traiter."
        actions={
          <div className="flex gap-2">
            <Badge ton="mission" point>{triees.length} en cours</Badge>
            {enRetard ? <Badge ton="cap" point>{enRetard} en retard</Badge> : null}
          </div>
        }
      />

      {triees.length === 0 ? (
        <Vide icone={CheckCircle2} titre="Tout est à jour" texte="Aucune étape ne vous est confiée pour le moment. Les nouvelles missions apparaîtront ici et par SMS." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 entree-cascade">
          {triees.map((etape) => {
            const retard = etape.limiteLe != null && etape.limiteLe.getTime() < maintenant;
            const faites = etape.taches.filter((tache) => tache.faite).length + etape.pieces.filter((piece) => piece.recue).length;
            const total = etape.taches.length + etape.pieces.length;
            const ratio = total ? Math.round((faites / total) * 100) : 0;
            return (
              <Link
                key={etape.id}
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
          })}
        </div>
      )}

      {relances.length > 0 ? (
        <div className="grid gap-3">
          <h2 className="flex items-center gap-2 text-lg font-bold"><PhoneCall size={19} className="text-edu" /> Prospects à rappeler aujourd'hui</h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 entree-cascade">
            {relances.map((prospect) => (
              <Link key={prospect.id} href={`/prospects/${prospect.id}`} className="carte carte-lien flex items-center gap-3 py-3.5">
                <Avatar prenom={prospect.prenom} nom={prospect.nom} />
                <div className="min-w-0">
                  <p className="truncate font-semibold">{nomComplet(prospect)}</p>
                  <p className="text-xs text-ink/50">{prospect.telephone}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
