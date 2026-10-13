import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ArrowRight, CalendarClock, Handshake, Mail, Phone, Rocket, StickyNote } from "lucide-react";
import { prisma } from "@/lib/db";
import { formatDate, formatJour, nomComplet } from "@/lib/format";
import { labelSource } from "@/lib/labels";
import { Formulaire } from "@/components/formulaire";
import { Avatar, Badge, Champ } from "@/components/ui";
import { convertirProspect, modifierProspect } from "@/server/actions";
import { peutProspects } from "@/server/permissions";
import { requireUser } from "@/server/session";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const prospect = await prisma.prospect.findUnique({ where: { id }, select: { prenom: true, nom: true } });
  return { title: prospect ? nomComplet(prospect) : "Prospect" };
}

export default async function ProspectPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!peutProspects(user.role)) redirect("/missions");
  const { id } = await params;
  const prospect = await prisma.prospect.findUnique({ where: { id }, include: { partenaire: true } });
  if (!prospect) notFound();
  const procedures = await prisma.procedure.findMany({ where: { actif: true }, orderBy: { nom: "asc" } });

  return (
    <section className="mx-auto grid w-full max-w-4xl gap-6">
      <Link href="/prospects" className="bouton-fantome w-fit -ml-2.5">
        <ArrowLeft size={16} /> Prospects
      </Link>

      <header className="flex flex-wrap items-center gap-4">
        <Avatar prenom={prospect.prenom} nom={prospect.nom} taille="lg" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{nomComplet(prospect)}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink/55">
            <Badge ton="desk">{labelSource(prospect.source)}</Badge>
            <span>Saisi le {formatDate(prospect.creeLe)}</span>
          </div>
        </div>
      </header>

      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <article className="carte grid gap-3 self-start text-sm">
          <a href={`tel:${prospect.telephone}`} className="flex items-center gap-3 rounded-xl bg-desk/[0.05] px-4 py-3 font-semibold text-desk transition hover:bg-desk/10">
            <Phone size={17} /> Appeler {prospect.telephone}
          </a>
          <p className="flex items-center gap-2.5"><Mail size={16} className="text-ink/35" /> {prospect.email || <span className="text-ink/40">Pas d'e-mail</span>}</p>
          <p className="flex items-center gap-2.5"><Handshake size={16} className="text-ink/35" /> {prospect.partenaire?.nom ?? <span className="text-ink/40">Sans partenaire</span>}</p>
          <p className="flex items-center gap-2.5"><CalendarClock size={16} className="text-ink/35" /> Relance : {prospect.relanceLe ? formatJour(prospect.relanceLe) : <span className="text-ink/40">non programmée</span>}</p>
          {prospect.notes ? (
            <p className="flex gap-2.5 rounded-xl bg-paper px-4 py-3 whitespace-pre-line text-ink/75"><StickyNote size={16} className="mt-0.5 shrink-0 text-ink/35" /> {prospect.notes}</p>
          ) : null}
        </article>

        <div className="grid gap-6 self-start">
          {prospect.converti ? (
            <article className="carte flex items-center justify-between gap-3 bg-vert/[0.05]">
              <div>
                <p className="font-semibold text-vert">Ce prospect est devenu client</p>
                <p className="text-sm text-ink/55">Son dossier suit son cours.</p>
              </div>
              {prospect.clientId ? (
                <Link className="bouton-second" href={`/clients/${prospect.clientId}`}>Fiche client <ArrowRight size={15} /></Link>
              ) : null}
            </article>
          ) : (
            <article className="carte relative overflow-hidden">
              <div className="absolute -top-10 -right-10 h-32 w-32 rounded-full bg-edu/20 blur-2xl" />
              <h2 className="relative flex items-center gap-2 text-lg font-bold"><Rocket size={19} className="text-desk" /> Il est prêt ? Ouvrez son dossier</h2>
              <p className="relative mt-1 text-sm text-ink/60">L'identité est reprise automatiquement, le dossier démarre à l'étape 1.</p>
              <Formulaire action={convertirProspect} submit="Convertir en client" succes="Dossier ouvert" className="relative mt-4 grid gap-3">
                <input type="hidden" name="prospectId" value={prospect.id} />
                <Champ label="Procédure">
                  <select className="champ" name="procedureId" required>
                    {procedures.map((procedure) => (
                      <option key={procedure.id} value={procedure.id}>{procedure.nom}</option>
                    ))}
                  </select>
                </Champ>
              </Formulaire>
            </article>
          )}

          <article className="carte">
            <h2 className="mb-3 font-semibold">Suivi du contact</h2>
            <Formulaire action={modifierProspect} submit="Enregistrer" succes="Suivi mis à jour" reinitialiser={false} boutonClassName="bouton-second" className="grid gap-4">
              <input type="hidden" name="prospectId" value={prospect.id} />
              <Champ label="E-mail"><input className="champ" type="email" name="email" defaultValue={prospect.email ?? ""} /></Champ>
              <Champ label="Prochaine relance"><input className="champ" type="date" name="relanceLe" defaultValue={prospect.relanceLe?.toISOString().slice(0, 10) ?? ""} /></Champ>
              <Champ label="Notes"><textarea className="champ" name="notes" rows={4} defaultValue={prospect.notes ?? ""} /></Champ>
            </Formulaire>
          </article>
        </div>
      </div>
    </section>
  );
}
