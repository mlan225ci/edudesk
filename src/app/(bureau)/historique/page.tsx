import Link from "next/link";
import { redirect } from "next/navigation";
import { ScrollText } from "lucide-react";
import { prisma } from "@/lib/db";
import { nomComplet } from "@/lib/format";
import { Journal } from "@/components/journal";
import { EnTete } from "@/components/ui";
import { LIBELLES_ACTIONS, lireJournal } from "@/server/historique";
import { aLeDroit } from "@/server/acces";
import { requireUser } from "@/server/session";

export const metadata = { title: "Historique" };

const TAILLE = 40;

export default async function HistoriquePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; auteur?: string; action?: string; client?: string; page?: string; consultations?: string }>;
}) {
  const user = await requireUser();
  if (!(await aLeDroit(user, "historique"))) redirect("/tableau-de-bord");
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const q = (params.q ?? "").trim().slice(0, 80);
  const auteur = params.auteur ?? "";
  const action = params.action && LIBELLES_ACTIONS[params.action] ? params.action : "";
  const clientId = params.client ?? "";
  const consultations = params.consultations === "1";

  const client = clientId
    ? await prisma.client.findUnique({
        where: { id: clientId },
        select: { id: true, prenom: true, nom: true, dossiers: { select: { id: true } } },
      })
    : null;

  const [lignes, auteurs] = await Promise.all([
    lireJournal({
      q,
      auteurId: auteur || undefined,
      action: action || undefined,
      clientId: client?.id,
      dossierIds: client?.dossiers.map((dossier) => dossier.id),
      consultations,
      take: TAILLE,
      skip: (page - 1) * TAILLE,
    }),
    prisma.user.findMany({
      where: { actif: true, role: { not: "PARTENAIRE" } },
      select: { id: true, prenom: true, nom: true },
      orderBy: [{ prenom: "asc" }, { nom: "asc" }],
    }),
  ]);

  const suite = new URLSearchParams();
  if (q) suite.set("q", q);
  if (auteur) suite.set("auteur", auteur);
  if (action) suite.set("action", action);
  if (client) suite.set("client", client.id);
  if (consultations) suite.set("consultations", "1");
  const base = suite.toString();
  const hrefPage = (numero: number) => {
    const copie = new URLSearchParams(base);
    if (numero > 1) copie.set("page", String(numero));
    const query = copie.toString();
    return query ? `/historique?${query}` : "/historique";
  };

  return (
    <section className="grid gap-6">
      <EnTete
        titre="Historique"
        icone={ScrollText}
        surTitre="Direction"
        description="Toutes les actions enregistrées dans l'application, avec la personne qui les a faites."
      />

      <form className="carte grid gap-3 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end" method="get">
        {client ? <input type="hidden" name="client" value={client.id} /> : null}
        <label className="grid gap-1.5 text-sm font-medium text-ink/80">
          Recherche
          <input className="champ" name="q" defaultValue={q} placeholder="Nom, détail, action…" />
        </label>
        <label className="grid gap-1.5 text-sm font-medium text-ink/80">
          Personne
          <select className="champ" name="auteur" defaultValue={auteur}>
            <option value="">Tout le monde</option>
            {auteurs.map((personne) => (
              <option key={personne.id} value={personne.id}>{nomComplet(personne)}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-1.5 text-sm font-medium text-ink/80">
          Action
          <select className="champ" name="action" defaultValue={action}>
            <option value="">Toutes</option>
            {Object.entries(LIBELLES_ACTIONS).map(([code, libelle]) => (
              <option key={code} value={code}>{libelle}</option>
            ))}
          </select>
        </label>
        <button className="bouton" type="submit">Filtrer</button>
        <label className="flex items-center gap-2 text-sm text-ink/70 md:col-span-4">
          <input type="checkbox" name="consultations" value="1" defaultChecked={consultations} />
          Inclure les consultations de documents
        </label>
        {client ? <p className="text-sm text-ink/60 md:col-span-4">Filtré sur {nomComplet(client)}. <Link href="/historique" className="font-semibold text-desk hover:underline">Voir tout</Link></p> : null}
      </form>

      <div className="carte">
        <Journal lignes={lignes} vide="Aucune action ne correspond à ces filtres." />
        <div className="mt-4 flex items-center justify-between text-sm">
          {page > 1 ? <Link href={hrefPage(page - 1)} className="font-semibold text-desk hover:underline">Page précédente</Link> : <span />}
          {lignes.length === TAILLE ? <Link href={hrefPage(page + 1)} className="font-semibold text-desk hover:underline">Page suivante</Link> : <span />}
        </div>
      </div>
    </section>
  );
}
