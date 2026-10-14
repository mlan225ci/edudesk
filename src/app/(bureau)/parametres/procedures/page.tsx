import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Plus, Route } from "lucide-react";
import { prisma } from "@/lib/db";
import { xof } from "@/lib/format";
import { Formulaire } from "@/components/formulaire";
import { Tiroir } from "@/components/tiroir";
import { Badge, Champ, EnTete, Info } from "@/components/ui";
import { peutProcedures } from "@/server/permissions";
import { creerProcedure } from "@/server/procedures";
import { requireUser } from "@/server/session";

export const metadata = { title: "Procédures" };

export default async function ProceduresPage() {
  const user = await requireUser();
  if (!peutProcedures(user.role)) redirect("/missions");
  const direction = user.role === "CEO" || user.role === "ADMINISTRATEUR";
  const procedures = await prisma.procedure.findMany({
    include: { _count: { select: { etapes: true, dossiers: true } } },
    orderBy: [{ actif: "desc" }, { nom: "asc" }],
  });
  const destinations = [...new Set(procedures.map((procedure) => procedure.destination))].sort();

  return (
    <section className="grid gap-6">
      <EnTete
        titre="Procédures"
        icone={Route}
        surTitre="Paramètres"
        description="Les parcours types : étapes, tâches, pièces, délais, tarif et commission. Cliquez pour paramétrer."
        actions={
          <Tiroir label="Nouvelle procédure" icone={<Plus size={16} />} titre="Nouvelle procédure" description="Elle reste en brouillon jusqu'à sa publication.">
            <Formulaire action={creerProcedure} submit="Créer et paramétrer" succes="Procédure créée" className="grid gap-4">
              <Champ label="Nom de la procédure"><input className="champ" name="nom" placeholder="Ex. Études Belgique" required autoFocus /></Champ>
              <Champ label="Destination" aide="Pays ou programme, repris sur les dossiers et les statistiques.">
                <input className="champ" name="destination" list="destinations-procedures" placeholder="Ex. Belgique" required />
              </Champ>
              <datalist id="destinations-procedures">
                {destinations.map((destination) => <option key={destination} value={destination} />)}
              </datalist>
              <Champ label="Point de départ" aide="Vous pourrez tout modifier ensuite : étapes, ordre, tâches, pièces, responsables.">
                <select className="champ" name="base" defaultValue="base">
                  <option value="base">Parcours de base : orientation, contrat et acompte, départ</option>
                  {procedures.map((procedure) => (
                    <option key={procedure.id} value={procedure.id}>Copie de « {procedure.nom} » ({procedure._count.etapes} étapes)</option>
                  ))}
                </select>
              </Champ>
              <label className="flex items-start gap-2.5 rounded-xl bg-paper p-3.5 text-sm">
                <input type="checkbox" name="ecoles" className="mt-0.5 h-4 w-4 accent-desk" />
                <span>
                  <span className="font-semibold">Procédure d'études</span>
                  <span className="block text-xs text-ink/55">Proposer et suivre des écoles du catalogue dans les dossiers.</span>
                </span>
              </label>
              {direction ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Champ label="Tarif client (F CFA)"><input className="champ" name="tarifXof" inputMode="numeric" placeholder="0" /></Champ>
                  <Champ label="Commission partenaire (F CFA)"><input className="champ" name="commissionXof" inputMode="numeric" placeholder="0" /></Champ>
                </div>
              ) : null}
            </Formulaire>
          </Tiroir>
        }
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 entree-cascade">
        {procedures.map((procedure) => (
          <Link key={procedure.id} href={`/parametres/procedures/${procedure.id}`} className="carte carte-lien group grid gap-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs font-semibold tracking-wide text-ink/45 uppercase">{procedure.destination}</p>
                <p className="mt-0.5 font-semibold group-hover:text-desk">{procedure.nom}</p>
              </div>
              {procedure.actif ? (
                <Badge ton="vert" point>Active</Badge>
              ) : procedure._count.dossiers > 0 ? (
                <Badge ton="gris" point>En pause</Badge>
              ) : (
                <Badge ton="edu" point>Brouillon</Badge>
              )}
            </div>
            <dl className="grid grid-cols-[1fr_1fr_1.6fr] gap-2 rounded-xl bg-paper p-3 text-center text-sm">
              <div><dt className="text-xs text-ink/50">Étapes</dt><dd className="font-bold">{procedure._count.etapes}</dd></div>
              <div><dt className="text-xs text-ink/50">Dossiers</dt><dd className="font-bold">{procedure._count.dossiers}</dd></div>
              <div><dt className="text-xs text-ink/50">Tarif</dt><dd className="font-bold whitespace-nowrap">{procedure.tarifXof ? xof(procedure.tarifXof) : "—"}</dd></div>
            </dl>
            <p className="flex items-center justify-between text-xs text-ink/45">
              Version {procedure.version}
              <span className="flex items-center gap-1 font-semibold text-desk opacity-0 transition group-hover:opacity-100">Paramétrer <ArrowRight size={14} /></span>
            </p>
          </Link>
        ))}
      </div>
      <Info>Une modification s'applique aux nouveaux dossiers ; les dossiers en cours gardent leur parcours. Seules les procédures actives sont proposées à l'ouverture d'un dossier.</Info>
    </section>
  );
}
