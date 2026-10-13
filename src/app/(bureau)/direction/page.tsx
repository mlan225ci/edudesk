import Link from "next/link";
import { redirect } from "next/navigation";
import { AlarmClock, ArrowRight, BellRing, Building2, FolderOpen, Handshake, Wallet } from "lucide-react";
import { prisma } from "@/lib/db";
import { debutJourAbidjan, delaiTexte, nomComplet, xof } from "@/lib/format";
import { STATUTS } from "@/lib/labels";
import { BoutonEnvoi, FormAction } from "@/components/formulaire";
import { BarresHorizontales, Kpi, Panneau } from "@/components/graphiques";
import { Avatar, Badge, EnTete } from "@/components/ui";
import { lancerAlertes } from "@/server/actions";
import { voitDirection } from "@/server/permissions";
import { requireUser } from "@/server/session";

export const metadata = { title: "Direction" };

export default async function DirectionPage() {
  const user = await requireUser();
  if (!voitDirection(user.role)) redirect("/missions");
  const maintenant = new Date();
  const depuis = debutJourAbidjan();
  const [dossiers, retards, paiements, partenaires] = await Promise.all([
    prisma.dossier.findMany({ select: { statut: true, procedure: { select: { destination: true } } } }),
    prisma.dossierEtape.findMany({
      where: { statut: "EN_COURS", limiteLe: { lt: maintenant } },
      include: { dossier: { include: { client: true, procedure: true } } },
      orderBy: { limiteLe: "asc" },
    }),
    prisma.paiement.aggregate({ where: { creeLe: { gte: depuis } }, _sum: { montant: true } }),
    prisma.partenaire.findMany({
      include: { clients: { include: { dossiers: { include: { procedure: true } } } } },
    }),
  ]);

  const parDestination = new Map<string, number>();
  for (const dossier of dossiers) {
    parDestination.set(dossier.procedure.destination, (parDestination.get(dossier.procedure.destination) ?? 0) + 1);
  }
  const actifs = dossiers.filter((dossier) => dossier.statut !== "REORIENTE").length;
  const commissions = partenaires
    .map((partenaire) => {
      const valides = partenaire.clients.flatMap((client) => client.dossiers.filter((dossier) => dossier.statut !== "REORIENTE"));
      return { partenaire, nombre: valides.length, montant: valides.reduce((somme, dossier) => somme + dossier.procedure.commissionXof, 0) };
    })
    .sort((a, b) => b.montant - a.montant);

  return (
    <section className="grid gap-6">
      <EnTete
        titre="Direction"
        icone={Building2}
        description="Vue de pilotage : retards, entonnoir commercial et commissions à reverser."
        actions={
          <FormAction action={lancerAlertes} succes="Alertes envoyées aux responsables en retard">
            <BoutonEnvoi className="bouton"><BellRing size={16} /> Relancer les retards par SMS</BoutonEnvoi>
          </FormAction>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi titre="Dossiers actifs" valeur={actifs} icone={FolderOpen} href="/dossiers" />
        <Kpi titre="Étapes en retard" valeur={retards.length} icone={AlarmClock} ton={retards.length ? "cap" : "vert"} href="/dossiers?retard=1" />
        <Kpi titre="Encaissé aujourd'hui" valeur={paiements._sum.montant ?? 0} format="xof" icone={Wallet} ton="vert" href="/caisse" />
        <Kpi titre="Partenaires" valeur={partenaires.length} icone={Handshake} href="/partenaires" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panneau titre="Étapes en retard" icone={AlarmClock} action={retards.length ? <Badge ton="cap">{retards.length}</Badge> : null}>
          {retards.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink/50">Aucun retard, bravo à l'équipe.</p>
          ) : (
            <ul className="grid gap-1">
              {retards.slice(0, 10).map((etape) => (
                <li key={etape.id}>
                  <Link href={`/dossiers/${etape.dossier.id}`} className="group flex items-center gap-3 rounded-xl px-2 py-2.5 transition hover:bg-paper">
                    <Avatar prenom={etape.dossier.client.prenom} nom={etape.dossier.client.nom} taille="sm" />
                    <div className="min-w-0 flex-1 text-sm">
                      <p className="truncate font-semibold">{nomComplet(etape.dossier.client)}</p>
                      <p className="truncate text-xs text-ink/50">{etape.titre} · {etape.dossier.procedure.destination}</p>
                    </div>
                    <span className="text-xs font-semibold whitespace-nowrap text-cap">{delaiTexte(etape.limiteLe)}</span>
                    <ArrowRight size={15} className="text-ink/25 group-hover:text-desk" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panneau>

        <div className="grid gap-6 self-start">
          <Panneau titre="Entonnoir des dossiers">
            <BarresHorizontales
              ton="desk"
              donnees={Object.entries(STATUTS).map(([statut, label]) => ({
                label,
                valeur: dossiers.filter((dossier) => dossier.statut === statut).length,
                href: `/dossiers?statut=${statut}`,
              }))}
            />
          </Panneau>
          <Panneau titre="Par destination">
            <BarresHorizontales ton="edu" donnees={[...parDestination.entries()].sort((a, b) => b[1] - a[1]).map(([label, valeur]) => ({ label, valeur }))} />
          </Panneau>
        </div>
      </div>

      <Panneau titre="Commissions partenaires" icone={Handshake} action={<Link href="/partenaires" className="text-sm font-semibold text-desk hover:underline">Gérer</Link>}>
        <p className="mb-3 text-sm text-ink/55">Commission de la procédure × dossiers apportés. Le versement se fait depuis la page Partenaires.</p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {commissions.map(({ partenaire, nombre, montant }) => (
            <div key={partenaire.id} className="flex items-center justify-between rounded-xl bg-paper px-4 py-3 text-sm">
              <div>
                <p className="font-semibold">{partenaire.nom}</p>
                <p className="text-xs text-ink/50">{nombre} dossier{nombre > 1 ? "s" : ""}</p>
              </div>
              <span className="font-bold tabular-nums">{xof(montant)}</span>
            </div>
          ))}
        </div>
      </Panneau>
    </section>
  );
}
