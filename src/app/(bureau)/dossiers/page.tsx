import Link from "next/link";
import type { Prisma, StatutDossier } from "@prisma/client";
import { AlarmClock, FolderOpen, Search, SearchX } from "lucide-react";
import { prisma } from "@/lib/db";
import { delaiTexte, formatJour, nomComplet } from "@/lib/format";
import { STATUTS, TON_STATUT } from "@/lib/labels";
import { peutCreerClient } from "@/server/permissions";
import { requireUser } from "@/server/session";
import { Avatar, Badge, EnTete, Onglets, Vide } from "@/components/ui";
import { Filtres } from "@/components/filtres";

export const metadata = { title: "Dossiers" };

export default async function DossiersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; destination?: string; retard?: string; statut?: string }>;
}) {
  const user = await requireUser();
  const filtres = await searchParams;
  const statut = filtres.statut && filtres.statut in STATUTS ? (filtres.statut as StatutDossier) : undefined;
  const base: Prisma.DossierWhereInput = user.role === "PARTENAIRE" ? { client: { partenaireId: user.partenaireId ?? "__aucun__" } } : {};
  const where: Prisma.DossierWhereInput = { ...base };
  if (filtres.destination) where.procedure = { code: filtres.destination };
  if (statut) where.statut = statut;
  if (filtres.q) {
    where.OR = [
      { reference: { contains: filtres.q, mode: "insensitive" } },
      { client: { nom: { contains: filtres.q, mode: "insensitive" } } },
      { client: { prenom: { contains: filtres.q, mode: "insensitive" } } },
      { client: { telephone: { contains: filtres.q } } },
    ];
  }

  const [procedures, dossiers, compteurs] = await Promise.all([
    prisma.procedure.findMany({ where: { actif: true }, orderBy: { nom: "asc" } }),
    prisma.dossier.findMany({
      where,
      include: { client: true, procedure: true, etapes: { select: { statut: true, titre: true, limiteLe: true }, orderBy: { rang: "asc" } } },
      orderBy: { ouvertLe: "desc" },
    }),
    prisma.dossier.groupBy({ by: ["statut"], where: base, _count: true }),
  ]);
  const maintenant = new Date();
  const visibles = filtres.retard
    ? dossiers.filter((dossier) => dossier.etapes.some((etape) => etape.statut === "EN_COURS" && etape.limiteLe && etape.limiteLe < maintenant))
    : dossiers;
  const total = compteurs.reduce((somme, ligne) => somme + ligne._count, 0);
  const lien = (changement: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    const suite = { q: filtres.q, destination: filtres.destination, retard: filtres.retard, statut, ...changement };
    for (const [cle, valeur] of Object.entries(suite)) if (valeur) params.set(cle, valeur);
    return `/dossiers${params.size ? `?${params}` : ""}`;
  };

  return (
    <section className="grid gap-6">
      <EnTete
        titre={user.role === "PARTENAIRE" ? "Mes clients" : "Dossiers"}
        icone={FolderOpen}
        description="Chaque dossier suit les étapes de sa procédure. Cliquez sur une ligne pour voir l'étape en cours."
        actions={
          peutCreerClient(user.role) ? (
            <Link href="/clients?nouveau=1" className="bouton">
              Nouveau dossier
            </Link>
          ) : null
        }
      />

      <Onglets
        actif={lien({ statut })}
        onglets={[
          { href: lien({ statut: undefined }), label: "Tous", nombre: total },
          ...(Object.keys(STATUTS) as StatutDossier[]).map((cle) => ({
            href: lien({ statut: cle }),
            label: STATUTS[cle],
            nombre: compteurs.find((ligne) => ligne.statut === cle)?._count ?? 0,
          })),
        ]}
      />

      <Filtres className="flex flex-wrap items-center gap-2" action="/dossiers">
        {statut ? <input type="hidden" name="statut" value={statut} /> : null}
        <div className="relative min-w-60 flex-1 sm:max-w-sm">
          <Search size={16} className="absolute top-1/2 left-3.5 -translate-y-1/2 text-ink/35" />
          <input className="champ pl-10" name="q" placeholder="Nom, téléphone ou référence" defaultValue={filtres.q ?? ""} />
        </div>
        <select className="champ w-auto" name="destination" defaultValue={filtres.destination ?? ""}>
          <option value="">Toutes les destinations</option>
          {procedures.map((procedure) => (
            <option key={procedure.id} value={procedure.code}>{procedure.nom}</option>
          ))}
        </select>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-ink/10 bg-white px-3.5 py-2.5 text-sm font-medium has-checked:border-cap/40 has-checked:bg-cap/5 has-checked:text-cap">
          <input type="checkbox" name="retard" value="1" defaultChecked={Boolean(filtres.retard)} className="accent-cap" />
          <AlarmClock size={15} /> En retard
        </label>
      </Filtres>

      {visibles.length === 0 ? (
        <Vide icone={SearchX} titre="Aucun dossier ne correspond" texte="Essayez d'élargir la recherche ou de retirer un filtre." action={<Link href="/dossiers" className="bouton-second">Réinitialiser les filtres</Link>} />
      ) : (
        <div className="carte overflow-x-auto p-0">
          <table className="tableau min-w-[760px]">
            <thead>
              <tr>
                <th className="!pl-5">Client</th>
                <th>Destination</th>
                <th>Statut</th>
                <th>Étape en cours</th>
                <th>Avancement</th>
                <th className="!pr-5 text-right">Délai</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((dossier) => {
                const etape = dossier.etapes.find((item) => item.statut === "EN_COURS");
                const retard = etape?.limiteLe && etape.limiteLe < maintenant;
                const faites = dossier.etapes.filter((item) => item.statut === "CLOTUREE").length;
                const ratio = dossier.etapes.length ? Math.round((faites / dossier.etapes.length) * 100) : 0;
                return (
                  <tr key={dossier.id} className="group relative">
                    <td className="!pl-5">
                      <Link href={`/dossiers/${dossier.id}`} className="flex items-center gap-3 after:absolute after:inset-0">
                        <Avatar prenom={dossier.client.prenom} nom={dossier.client.nom} taille="sm" />
                        <span>
                          <span className="block font-semibold group-hover:text-desk">{nomComplet(dossier.client)}</span>
                          <span className="block text-xs text-ink/45">{dossier.reference} · ouvert le {formatJour(dossier.ouvertLe)}</span>
                        </span>
                      </Link>
                    </td>
                    <td>{dossier.procedure.destination}</td>
                    <td>
                      <Badge ton={TON_STATUT[dossier.statut]} point>{STATUTS[dossier.statut]}</Badge>
                    </td>
                    <td className="max-w-56 truncate text-ink/70">{etape?.titre ?? "—"}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-20 overflow-hidden rounded-full bg-ink/[0.06]">
                          <div className="h-full rounded-full bg-desk" style={{ width: `${ratio}%` }} />
                        </div>
                        <span className="text-xs text-ink/50">{ratio}%</span>
                      </div>
                    </td>
                    <td className={`!pr-5 text-right text-sm ${retard ? "font-semibold text-cap" : "text-ink/60"}`}>{etape ? delaiTexte(etape.limiteLe) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
