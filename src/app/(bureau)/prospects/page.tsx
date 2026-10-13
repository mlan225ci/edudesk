import Link from "next/link";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { Megaphone, PhoneCall, Search, UserPlus } from "lucide-react";
import { prisma } from "@/lib/db";
import { formatJour, nomComplet } from "@/lib/format";
import { SOURCES, labelSource } from "@/lib/labels";
import { Formulaire } from "@/components/formulaire";
import { Tiroir } from "@/components/tiroir";
import { Avatar, Badge, Champ, Choix, EnTete, Onglets, Vide } from "@/components/ui";
import { creerProspect } from "@/server/actions";
import { peutProspects } from "@/server/permissions";
import { requireUser } from "@/server/session";
import { Filtres } from "@/components/filtres";

export const metadata = { title: "Prospects" };

export default async function ProspectsPage({ searchParams }: { searchParams: Promise<{ filtre?: string; q?: string; nouveau?: string }> }) {
  const user = await requireUser();
  if (!peutProspects(user.role)) redirect("/missions");
  const { filtre = "actifs", q, nouveau } = await searchParams;
  const finJour = new Date();
  finJour.setUTCHours(23, 59, 59, 999);

  const filtres: Record<string, Prisma.ProspectWhereInput> = {
    actifs: { converti: false },
    relance: { converti: false, relanceLe: { lte: finJour } },
    convertis: { converti: true },
    tous: {},
  };
  const where: Prisma.ProspectWhereInput = { ...(filtres[filtre] ?? filtres.actifs) };
  if (q) {
    where.OR = [
      { nom: { contains: q, mode: "insensitive" } },
      { prenom: { contains: q, mode: "insensitive" } },
      { telephone: { contains: q } },
    ];
  }

  const [prospects, partenaires, compteurs] = await Promise.all([
    prisma.prospect.findMany({ where, orderBy: filtre === "relance" ? { relanceLe: "asc" } : { creeLe: "desc" }, include: { partenaire: true } }),
    prisma.partenaire.findMany({ orderBy: { nom: "asc" } }),
    Promise.all(["actifs", "relance", "convertis", "tous"].map((cle) => prisma.prospect.count({ where: filtres[cle] }))),
  ]);
  const [nActifs, nRelance, nConvertis, nTous] = compteurs;
  const taux = nTous ? Math.round((nConvertis / nTous) * 100) : 0;

  return (
    <section className="grid gap-6">
      <EnTete
        titre="Prospects"
        icone={Megaphone}
        description={`Les contacts à transformer en clients. Taux de conversion : ${taux}%.`}
        actions={
          <Tiroir label="Nouveau prospect" icone={<UserPlus size={16} />} titre="Nouveau prospect" description="Notez le contact, programmez une relance." ouvertParDefaut={nouveau === "1"}>
            <Formulaire action={creerProspect} submit="Enregistrer le prospect" succes="Prospect enregistré" className="grid gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Champ label="Prénom"><input className="champ" name="prenom" required autoFocus /></Champ>
                <Champ label="Nom"><input className="champ" name="nom" required /></Champ>
              </div>
              <Champ label="Téléphone"><input className="champ" name="telephone" defaultValue="+225" required /></Champ>
              <Champ label="E-mail"><input className="champ" name="email" type="email" placeholder="Facultatif" /></Champ>
              <Choix label="Comment nous a-t-il connus ?" name="source" options={SOURCES} colonnes={2} />
              <Champ label="Partenaire" aide="Obligatoire si le contact vient d'un partenaire.">
                <select className="champ" name="partenaireId" defaultValue="">
                  <option value="">Aucun</option>
                  {partenaires.map((partenaire) => (
                    <option key={partenaire.id} value={partenaire.id}>{partenaire.nom}</option>
                  ))}
                </select>
              </Champ>
              <Champ label="Date de relance"><input className="champ" type="date" name="relanceLe" /></Champ>
              <Champ label="Notes"><textarea className="champ" name="notes" rows={3} placeholder="Projet, budget, disponibilité…" /></Champ>
            </Formulaire>
          </Tiroir>
        }
      />

      <Onglets
        actif={`/prospects?filtre=${filtre}`}
        onglets={[
          { href: "/prospects?filtre=actifs", label: "À traiter", nombre: nActifs },
          { href: "/prospects?filtre=relance", label: "À relancer aujourd'hui", nombre: nRelance },
          { href: "/prospects?filtre=convertis", label: "Convertis", nombre: nConvertis },
          { href: "/prospects?filtre=tous", label: "Tous", nombre: nTous },
        ]}
      />

      <Filtres className="relative max-w-md" action="/prospects">
        <input type="hidden" name="filtre" value={filtre} />
        <Search size={16} className="absolute top-1/2 left-3.5 -translate-y-1/2 text-ink/35" />
        <input className="champ pl-10" name="q" placeholder="Nom ou téléphone…" defaultValue={q ?? ""} />
      </Filtres>

      {prospects.length === 0 ? (
        <Vide
          icone={filtre === "relance" ? PhoneCall : Megaphone}
          titre={filtre === "relance" ? "Aucune relance prévue aujourd'hui" : "Aucun prospect ici"}
          texte="Ajoutez un prospect avec le bouton « Nouveau prospect »."
        />
      ) : (
        <div className="carte overflow-x-auto p-0">
          <table className="tableau min-w-[700px]">
            <thead>
              <tr>
                <th className="!pl-5">Contact</th>
                <th>Téléphone</th>
                <th>Source</th>
                <th>Relance</th>
                <th className="!pr-5">État</th>
              </tr>
            </thead>
            <tbody>
              {prospects.map((prospect) => {
                const enRetard = !prospect.converti && prospect.relanceLe && prospect.relanceLe <= finJour;
                return (
                  <tr key={prospect.id} className="group relative">
                    <td className="!pl-5">
                      <Link href={`/prospects/${prospect.id}`} className="flex items-center gap-3 after:absolute after:inset-0">
                        <Avatar prenom={prospect.prenom} nom={prospect.nom} taille="sm" />
                        <span>
                          <span className="block font-semibold group-hover:text-desk">{nomComplet(prospect)}</span>
                          <span className="block text-xs text-ink/45">Saisi le {formatJour(prospect.creeLe)}</span>
                        </span>
                      </Link>
                    </td>
                    <td className="tabular-nums text-ink/70">{prospect.telephone}</td>
                    <td className="text-ink/70">
                      {labelSource(prospect.source)}
                      {prospect.partenaire ? <span className="block text-xs text-ink/45">{prospect.partenaire.nom}</span> : null}
                    </td>
                    <td className={enRetard ? "font-semibold text-cap" : "text-ink/60"}>{prospect.relanceLe ? formatJour(prospect.relanceLe) : "—"}</td>
                    <td className="!pr-5">
                      {prospect.converti ? <Badge ton="vert" point>Client</Badge> : enRetard ? <Badge ton="cap" point>À rappeler</Badge> : <Badge ton="edu" point>En cours</Badge>}
                    </td>
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
