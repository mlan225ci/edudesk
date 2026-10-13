import Link from "next/link";
import { Search, UserPlus, Users } from "lucide-react";
import { prisma } from "@/lib/db";
import { formatJour, nomComplet } from "@/lib/format";
import { STATUTS, TON_STATUT } from "@/lib/labels";
import { creerClient } from "@/server/actions";
import { peutCreerClient } from "@/server/permissions";
import { requireUser } from "@/server/session";
import { ChampsClient } from "@/components/champs-client";
import { Formulaire } from "@/components/formulaire";
import { Tiroir } from "@/components/tiroir";
import { Avatar, Badge, EnTete, Vide } from "@/components/ui";
import { Filtres } from "@/components/filtres";

export const metadata = { title: "Clients" };

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ q?: string; nouveau?: string }> }) {
  const user = await requireUser();
  const { q, nouveau } = await searchParams;
  const creation = peutCreerClient(user.role);
  const [clients, partenaires, procedures] = await Promise.all([
    prisma.client.findMany({
      where: {
        ...(user.role === "PARTENAIRE" ? { partenaireId: user.partenaireId ?? "__aucun__" } : {}),
        ...(q
          ? {
              OR: [
                { nom: { contains: q, mode: "insensitive" } },
                { prenom: { contains: q, mode: "insensitive" } },
                { telephone: { contains: q } },
              ],
            }
          : {}),
      },
      include: { partenaire: true, dossiers: { select: { statut: true, ouvertLe: true }, orderBy: { ouvertLe: "desc" }, take: 1 }, _count: { select: { dossiers: true } } },
      orderBy: { creeLe: "desc" },
    }),
    creation ? prisma.partenaire.findMany({ select: { id: true, nom: true }, orderBy: { nom: "asc" } }) : [],
    creation ? prisma.procedure.findMany({ where: { actif: true }, select: { id: true, nom: true }, orderBy: { nom: "asc" } }) : [],
  ]);

  return (
    <section className="grid gap-6">
      <EnTete
        titre="Clients"
        icone={Users}
        description="Toutes les personnes accompagnées. Créez un client et son dossier en une seule fois."
        actions={
          creation ? (
            <Tiroir
              label="Nouveau client"
              icone={<UserPlus size={16} />}
              titre="Nouveau client"
              description="Renseignez l'essentiel, le dossier s'ouvre automatiquement."
              ouvertParDefaut={nouveau === "1"}
            >
              <Formulaire action={creerClient} submit="Créer le client" succes="Client créé" className="grid gap-4">
                <ChampsClient partenaires={partenaires} procedures={procedures} />
              </Formulaire>
            </Tiroir>
          ) : null
        }
      />

      <Filtres className="relative max-w-md" action="/clients">
        <Search size={16} className="absolute top-1/2 left-3.5 -translate-y-1/2 text-ink/35" />
        <input className="champ pl-10" name="q" placeholder="Rechercher par nom ou téléphone…" defaultValue={q ?? ""} />
      </Filtres>

      {clients.length === 0 ? (
        <Vide
          icone={Users}
          titre={q ? "Aucun client trouvé" : "Aucun client pour l'instant"}
          texte={q ? "Vérifiez l'orthographe ou cherchez par numéro de téléphone." : "Créez votre premier client pour démarrer un dossier."}
        />
      ) : (
        <div className="carte overflow-x-auto p-0">
          <table className="tableau min-w-[680px]">
            <thead>
              <tr>
                <th className="!pl-5">Client</th>
                <th>Téléphone</th>
                <th>Partenaire</th>
                <th>Dernier dossier</th>
                <th className="!pr-5 text-right">Dossiers</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((client) => {
                const dernier = client.dossiers[0];
                return (
                  <tr key={client.id} className="group relative">
                    <td className="!pl-5">
                      <Link href={`/clients/${client.id}`} className="flex items-center gap-3 after:absolute after:inset-0">
                        <Avatar prenom={client.prenom} nom={client.nom} taille="sm" />
                        <span>
                          <span className="block font-semibold group-hover:text-desk">{nomComplet(client)}</span>
                          <span className="block text-xs text-ink/45">Depuis le {formatJour(client.creeLe)}</span>
                        </span>
                      </Link>
                    </td>
                    <td className="tabular-nums text-ink/70">{client.telephone}</td>
                    <td className="text-ink/70">{client.partenaire?.nom ?? "—"}</td>
                    <td>{dernier ? <Badge ton={TON_STATUT[dernier.statut]} point>{STATUTS[dernier.statut]}</Badge> : <span className="text-ink/40">Aucun</span>}</td>
                    <td className="!pr-5 text-right font-semibold">{client._count.dossiers}</td>
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
