import { redirect } from "next/navigation";
import type { CategorieDepense } from "@prisma/client";
import { Download, Hash, Plus, Receipt, TrendingDown } from "lucide-react";
import { prisma } from "@/lib/db";
import { cleMois, debutMois, formatJour, labelMois, moisDepuisCle, nomComplet, variation, xof } from "@/lib/format";
import { CATEGORIES_DEPENSE, MODES, labelCategorie, labelMode } from "@/lib/labels";
import { BoutonEnvoi, FormAction, Formulaire } from "@/components/formulaire";
import { BarresHorizontales, Kpi, Panneau } from "@/components/graphiques";
import { Tiroir } from "@/components/tiroir";
import { Badge, Champ, Choix, EnTete, Info, Vide } from "@/components/ui";
import { annulerDepense, creerDepense } from "@/server/actions";
import { peutAnnulerDepense, voitDepenses } from "@/server/permissions";
import { requireUser } from "@/server/session";
import { Filtres } from "@/components/filtres";

export const metadata = { title: "Dépenses" };

export default async function DepensesPage({ searchParams }: { searchParams: Promise<{ mois?: string; categorie?: string; nouveau?: string }> }) {
  const user = await requireUser();
  if (!voitDepenses(user.role)) redirect("/tableau-de-bord");
  const params = await searchParams;
  const debut = moisDepuisCle(params.mois);
  const fin = new Date(Date.UTC(debut.getUTCFullYear(), debut.getUTCMonth() + 1, 1));
  const categorie = CATEGORIES_DEPENSE.some((item) => item.value === params.categorie) ? (params.categorie as CategorieDepense) : undefined;
  const precedent = new Date(Date.UTC(debut.getUTCFullYear(), debut.getUTCMonth() - 1, 1));

  const [depenses, partenaires, auteurs, totalPrecedent] = await Promise.all([
    prisma.depense.findMany({
      where: { date: { gte: debut, lt: fin }, ...(categorie ? { categorie } : {}) },
      include: { partenaire: true },
      orderBy: [{ date: "desc" }, { creeLe: "desc" }],
    }),
    prisma.partenaire.findMany({ orderBy: { nom: "asc" } }),
    prisma.user.findMany({ select: { id: true, prenom: true, nom: true } }),
    prisma.depense.aggregate({ where: { date: { gte: precedent, lt: debut } }, _sum: { montant: true } }),
  ]);
  const total = depenses.reduce((somme, depense) => somme + depense.montant, 0);
  const parCategorie = new Map<string, number>();
  for (const depense of depenses) {
    parCategorie.set(labelCategorie(depense.categorie), (parCategorie.get(labelCategorie(depense.categorie)) ?? 0) + depense.montant);
  }
  const auteur = new Map(auteurs.map((item) => [item.id, nomComplet(item)]));
  const choixMois = Array.from({ length: 12 }, (_, index) => debutMois(-index));
  const annulable = peutAnnulerDepense(user.role);
  const totalPrec = totalPrecedent._sum.montant ?? 0;
  const plusGros = [...parCategorie.entries()].sort((a, b) => b[1] - a[1])[0];

  return (
    <section className="grid gap-6">
      <EnTete
        titre="Dépenses"
        icone={TrendingDown}
        surTitre={labelMois(debut, true)}
        description="Chaque dépense crée automatiquement son écriture comptable et sa sortie de trésorerie."
        actions={
          <>
            <a className="bouton-second" href={`/api/export/depenses?mois=${cleMois(debut)}`}>
              <Download size={15} /> Export
            </a>
            <Tiroir label="Nouvelle dépense" icone={<Plus size={16} />} titre="Nouvelle dépense" description="Loyer, salaires, transport, frais…" ouvertParDefaut={params.nouveau === "1"}>
              <Formulaire action={creerDepense} submit="Enregistrer la dépense" succes="Dépense enregistrée" className="grid gap-4">
                <Champ label="Catégorie">
                  <select className="champ" name="categorie" required defaultValue="">
                    <option value="" disabled>Choisir…</option>
                    {CATEGORIES_DEPENSE.map((item) => (
                      <option key={item.value} value={item.value}>{item.label}</option>
                    ))}
                  </select>
                </Champ>
                <Champ label="Motif"><input className="champ" name="libelle" placeholder="Ex. Loyer d'octobre" required /></Champ>
                <Champ label="Montant (F CFA)"><input className="champ text-lg font-semibold" name="montant" inputMode="numeric" placeholder="0" required /></Champ>
                <Choix label="Payé par" name="mode" options={MODES} />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Champ label="Bénéficiaire"><input className="champ" name="fournisseur" placeholder="Fournisseur…" /></Champ>
                  <Champ label="N° de pièce"><input className="champ" name="reference" placeholder="Reçu, facture…" /></Champ>
                </div>
                <Champ label="Partenaire concerné" aide="Pour une commission versée à un partenaire.">
                  <select className="champ" name="partenaireId" defaultValue="">
                    <option value="">Aucun</option>
                    {partenaires.map((partenaire) => (
                      <option key={partenaire.id} value={partenaire.id}>{partenaire.nom}</option>
                    ))}
                  </select>
                </Champ>
                <Champ label="Date"><input className="champ" type="date" name="date" required defaultValue={new Date().toISOString().slice(0, 10)} /></Champ>
              </Formulaire>
            </Tiroir>
          </>
        }
      />

      <Filtres className="flex flex-wrap gap-2" action="/depenses">
        <select className="champ w-auto capitalize" name="mois" defaultValue={cleMois(debut)}>
          {choixMois.map((item) => (
            <option key={cleMois(item)} value={cleMois(item)}>{labelMois(item, true)}</option>
          ))}
        </select>
        <select className="champ w-auto" name="categorie" defaultValue={categorie ?? ""}>
          <option value="">Toutes les catégories</option>
          {CATEGORIES_DEPENSE.map((item) => (
            <option key={item.value} value={item.value}>{item.label}</option>
          ))}
        </select>
      </Filtres>

      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi titre="Total du mois" valeur={total} format="xof" ton="mission" icone={TrendingDown} evolution={variation(total, totalPrec)} inverse detail={`vs ${xof(totalPrec)} le mois précédent`} />
        <Kpi titre="Pièces saisies" valeur={depenses.length} icone={Hash} />
        <Kpi titre="Premier poste" valeur={plusGros ? plusGros[0] : "—"} detail={plusGros ? xof(plusGros[1]) : undefined} icone={Receipt} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        {depenses.length === 0 ? (
          <Vide icone={Receipt} titre="Aucune dépense sur cette période" texte="Utilisez « Nouvelle dépense » pour enregistrer une sortie d'argent." />
        ) : (
          <div className="carte overflow-x-auto p-0 self-start">
            <table className="tableau min-w-[640px]">
              <thead>
                <tr>
                  <th className="!pl-5">Date</th>
                  <th>Motif</th>
                  <th>Catégorie</th>
                  <th>Moyen</th>
                  <th className="text-right">Montant</th>
                  {annulable ? <th className="!pr-5" /> : null}
                </tr>
              </thead>
              <tbody>
                {depenses.map((depense) => (
                  <tr key={depense.id}>
                    <td className="!pl-5 whitespace-nowrap text-ink/60">{formatJour(depense.date)}</td>
                    <td>
                      <p className="font-medium">{depense.libelle}</p>
                      <p className="text-xs text-ink/45">
                        {[depense.numero, depense.fournisseur, depense.partenaire?.nom, depense.reference, auteur.get(depense.saisiParId)].filter(Boolean).join(" · ")}
                      </p>
                    </td>
                    <td><Badge ton="gris">{labelCategorie(depense.categorie)}</Badge></td>
                    <td className="text-ink/60">{labelMode(depense.mode)}</td>
                    <td className="text-right font-semibold tabular-nums">{xof(depense.montant)}</td>
                    {annulable ? (
                      <td className="!pr-5 text-right">
                        <FormAction action={annulerDepense} succes="Dépense annulée" confirmer={`Annuler la dépense « ${depense.libelle} » ? L'écriture comptable sera supprimée.`}>
                          <input type="hidden" name="depenseId" value={depense.id} />
                          <BoutonEnvoi className="bouton-fantome text-xs text-cap">Annuler</BoutonEnvoi>
                        </FormAction>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="grid gap-4 self-start">
          <Panneau titre="Répartition">
            <BarresHorizontales
              ton="edu"
              format="xof"
              vide="Rien à afficher"
              donnees={[...parCategorie.entries()].sort((a, b) => b[1] - a[1]).map(([label, valeur]) => ({ label, valeur }))}
            />
          </Panneau>
          <Info>Les encaissements clients se saisissent dans la Caisse ; ici, uniquement les sorties d'argent.</Info>
        </div>
      </div>
    </section>
  );
}
