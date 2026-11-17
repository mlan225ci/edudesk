import Link from "next/link";
import { Archive, Search, UserPlus, Users } from "lucide-react";
import { prisma } from "@/lib/db";
import { formatJour, nomComplet } from "@/lib/format";
import { STATUTS, TON_STATUT } from "@/lib/labels";
import { attribuerClient, creerClient } from "@/server/actions";
import { aLeRole, filtreParRoles, peutArchiverClient, peutAttribuerClient, peutCreerClient } from "@/server/permissions";
import { suppressionAutorisee } from "@/server/regles";
import { requireUser } from "@/server/session";
import { ChampsClient } from "@/components/champs-client";
import { Formulaire } from "@/components/formulaire";
import { Tiroir } from "@/components/tiroir";
import { MenuClient } from "@/components/menu-client";
import { Avatar, Badge, EnTete, Vide } from "@/components/ui";
import { Filtres } from "@/components/filtres";

export const metadata = { title: "Clients" };

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ q?: string; nouveau?: string; responsable?: string; archives?: string }> }) {
  const user = await requireUser();
  const { q, nouveau, responsable, archives } = await searchParams;
  const creation = peutCreerClient(user);
  const attribution = peutAttribuerClient(user);
  const archivage = peutArchiverClient(user);
  const suppression = await suppressionAutorisee(user);
  const archivesVisibles = archivage && archives === "1";
  const [clients, partenaires, procedures, responsables] = await Promise.all([
    prisma.client.findMany({
      where: {
        archiveLe: archivesVisibles ? { not: null } : null,
        ...(user.role === "PARTENAIRE" ? { partenaireId: user.partenaireId ?? "__aucun__" } : {}),
        ...(aLeRole(user, "COMMERCIAL") && !aLeRole(user, "CEO", "ADMINISTRATEUR", "RESPONSABLE_COMMERCIALE")
          ? { responsableId: user.id }
          : {}),
        ...(responsable === "aucun" ? { responsableId: null } : {}),
        ...(responsable && responsable !== "aucun" ? { responsableId: responsable } : {}),
        ...(q
          ? {
              OR: [
                { nom: { contains: q, mode: "insensitive" } },
                { prenom: { contains: q, mode: "insensitive" } },
                { telephone: { contains: q } },
                { email: { contains: q, mode: "insensitive" } },
                { paysVise: { contains: q, mode: "insensitive" } },
                { dossiers: { some: { reference: { contains: q, mode: "insensitive" } } } },
                { dossiers: { some: { procedure: { nom: { contains: q, mode: "insensitive" } } } } },
                { dossiers: { some: { procedure: { destination: { contains: q, mode: "insensitive" } } } } },
              ],
            }
          : {}),
      },
      include: {
        partenaire: true,
        responsable: { select: { id: true, prenom: true, nom: true } },
        dossiers: { select: { statut: true, ouvertLe: true }, orderBy: { ouvertLe: "desc" }, take: 1 },
        _count: { select: { dossiers: true } },
      },
      orderBy: archivesVisibles ? { archiveLe: "desc" } : { creeLe: "desc" },
    }),
    creation ? prisma.partenaire.findMany({ select: { id: true, nom: true }, orderBy: { nom: "asc" } }) : [],
    creation ? prisma.procedure.findMany({ where: { actif: true }, select: { id: true, nom: true }, orderBy: { nom: "asc" } }) : [],
    attribution
      ? prisma.user.findMany({
          where: { actif: true, ...filtreParRoles(["COMMERCIAL", "RESPONSABLE_COMMERCIALE"]) },
          select: { id: true, prenom: true, nom: true, role: true },
          orderBy: [{ role: "asc" }, { prenom: "asc" }],
        })
      : [],
  ]);

  return (
    <section className="grid gap-6">
      <EnTete
        titre="Clients"
        icone={Users}
        description={archivesVisibles ? "Fiches retirées de la liste. Les dossiers et les paiements sont conservés." : "Les personnes accompagnées. Un commercial ne voit que les clients qui lui sont confiés."}
        actions={
          <div className="flex flex-wrap gap-2">
          {archivage ? (
            <Link href={archivesVisibles ? "/clients" : "/clients?archives=1"} className="bouton-second">
              <Archive size={16} /> {archivesVisibles ? "Clients actifs" : "Archives"}
            </Link>
          ) : null}
          {creation && !archivesVisibles ? (
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
          ) : null}
          </div>
        }
      />

      <Filtres className="flex flex-wrap items-center gap-3" action="/clients">
        {archivesVisibles ? <input type="hidden" name="archives" value="1" /> : null}
        <span className="relative min-w-64 flex-1">
          <Search size={16} className="absolute top-1/2 left-3.5 -translate-y-1/2 text-ink/35" />
          <input className="champ pl-10" name="q" placeholder="Nom, téléphone, dossier, pays ou procédure…" defaultValue={q ?? ""} />
        </span>
        {attribution && !archivesVisibles ? (
          <select className="champ w-auto" name="responsable" defaultValue={responsable ?? ""}>
            <option value="">Tous les responsables</option>
            <option value="aucun">Sans responsable</option>
            {responsables.map((personne) => (
              <option key={personne.id} value={personne.id}>{nomComplet(personne)}</option>
            ))}
          </select>
        ) : null}
      </Filtres>

      {clients.length === 0 ? (
        <Vide
          icone={Users}
          titre={q ? "Aucun client trouvé" : archivesVisibles ? "Aucune archive" : "Aucun client pour l'instant"}
          texte={q ? "Vérifiez l'orthographe ou cherchez par numéro de téléphone." : archivesVisibles ? "Les clients archivés apparaîtront ici." : "Créez votre premier client pour démarrer un dossier."}
        />
      ) : (
        <div className="carte overflow-x-auto p-0">
          <table className="tableau min-w-[860px]">
            <thead>
              <tr>
                <th className="!pl-5">Client</th>
                <th>Téléphone</th>
                <th>Responsable</th>
                <th>Partenaire</th>
                <th>Dernier dossier</th>
                <th className="text-right">Dossiers</th>
                <th className="w-12 !pr-3" />
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
                    <td className="relative z-10">
                      {attribution && !archivesVisibles ? (
                        <form action={attribuerClient} className="flex items-center gap-1.5">
                          <input type="hidden" name="clientId" value={client.id} />
                          <select className="champ w-44 py-1.5" name="responsableId" defaultValue={client.responsableId ?? ""}>
                            <option value="">Aucun</option>
                            {responsables.map((personne) => (
                              <option key={personne.id} value={personne.id}>{nomComplet(personne)}</option>
                            ))}
                          </select>
                          <button className="bouton-second px-3 py-1.5">OK</button>
                        </form>
                      ) : (
                        <span className="text-ink/70">{client.responsable ? nomComplet(client.responsable) : "—"}</span>
                      )}
                    </td>
                    <td className="text-ink/70">{client.partenaire?.nom ?? "—"}</td>
                    <td>{dernier ? <Badge ton={TON_STATUT[dernier.statut]} point>{STATUTS[dernier.statut]}</Badge> : <span className="text-ink/40">Aucun</span>}</td>
                    <td className="text-right font-semibold">{client._count.dossiers}</td>
                    <td className="relative z-20 !pr-3 text-right">
                      {archivage ? <MenuClient clientId={client.id} nom={nomComplet(client)} archive={archivesVisibles} suppression={suppression} /> : null}
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
