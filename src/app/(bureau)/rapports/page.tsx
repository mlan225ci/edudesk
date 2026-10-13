import { redirect } from "next/navigation";
import { Download, FileBarChart, PiggyBank, Scale, TrendingDown, TrendingUp } from "lucide-react";
import { prisma } from "@/lib/db";
import { EnTete } from "@/components/ui";
import { cleMois, debutMois, labelMois, moisDepuisCle, xof } from "@/lib/format";
import { CATEGORIES_DEPENSE, MODES, TYPES_PAIEMENT } from "@/lib/labels";
import { BarresMensuelles, Kpi, Panneau } from "@/components/graphiques";
import { voitRapports } from "@/server/permissions";
import { requireUser } from "@/server/session";
import { cumulParMois } from "@/server/stats";
import { Filtres } from "@/components/filtres";

const EXPORTS = [
  { type: "paiements", label: "Encaissements" },
  { type: "depenses", label: "Dépenses" },
  { type: "ecritures", label: "Écritures comptables" },
  { type: "dossiers", label: "Dossiers" },
  { type: "clients", label: "Clients" },
  { type: "prospects", label: "Prospects" },
];

export const metadata = { title: "Rapports" };

export default async function RapportsPage({ searchParams }: { searchParams: Promise<{ mois?: string }> }) {
  const user = await requireUser();
  if (!voitRapports(user.role)) redirect("/tableau-de-bord");
  const { mois } = await searchParams;
  const debut = moisDepuisCle(mois);
  const fin = new Date(Date.UTC(debut.getUTCFullYear(), debut.getUTCMonth() + 1, 1));
  const debutAnnee = new Date(Date.UTC(debut.getUTCFullYear(), 0, 1));
  const finAnnee = new Date(Date.UTC(debut.getUTCFullYear() + 1, 0, 1));

  const [paiements, depenses] = await Promise.all([
    prisma.paiement.findMany({
      where: { dateEncaissement: { gte: debutAnnee, lt: finAnnee } },
      select: { montant: true, type: true, mode: true, dateEncaissement: true },
    }),
    prisma.depense.findMany({
      where: { date: { gte: debutAnnee, lt: finAnnee } },
      select: { montant: true, categorie: true, date: true },
    }),
  ]);

  const duMois = <T,>(liste: T[], date: (element: T) => Date) => liste.filter((element) => date(element) >= debut && date(element) < fin);
  const paiementsMois = duMois(paiements, (p) => p.dateEncaissement);
  const depensesMois = duMois(depenses, (d) => d.date);
  const somme = (liste: { montant: number }[]) => liste.reduce((total, element) => total + element.montant, 0);

  const produitsMois = somme(paiementsMois);
  const chargesMois = somme(depensesMois);
  const produitsAnnee = somme(paiements);
  const chargesAnnee = somme(depenses);

  const moisAnnee = Array.from({ length: 12 }, (_, index) => {
    const date = new Date(Date.UTC(debut.getUTCFullYear(), index, 1));
    return { cle: cleMois(date), label: labelMois(date) };
  });
  const encaisseParMois = cumulParMois(paiements, (p) => p.dateEncaissement, (p) => p.montant);
  const depenseParMois = cumulParMois(depenses, (d) => d.date, (d) => d.montant);
  const resultatParMois = new Map(moisAnnee.map((item) => [item.cle, Math.max((encaisseParMois.get(item.cle) ?? 0) - (depenseParMois.get(item.cle) ?? 0), 0)]));
  const choixMois = Array.from({ length: 24 }, (_, index) => debutMois(-index));

  return (
    <section className="grid gap-6">
      <EnTete
        titre="Rapports"
        icone={FileBarChart}
        surTitre={labelMois(debut, true)}
        description="Compte de résultat simplifié (encaissements et décaissements) et exports pour Excel."
        actions={
          <Filtres className="flex gap-2" action="/rapports">
            <select className="champ w-auto capitalize" name="mois" defaultValue={cleMois(debut)}>
              {choixMois.map((item) => (
                <option key={cleMois(item)} value={cleMois(item)}>{labelMois(item, true)}</option>
              ))}
            </select>
          </Filtres>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi titre="Produits du mois" valeur={produitsMois} format="xof" ton="desk" icone={TrendingUp} />
        <Kpi titre="Charges du mois" valeur={chargesMois} format="xof" ton="mission" icone={TrendingDown} />
        <Kpi titre="Résultat du mois" valeur={produitsMois - chargesMois} format="xof" ton={produitsMois - chargesMois >= 0 ? "vert" : "cap"} icone={Scale} />
        <Kpi
          titre={`Résultat ${debut.getUTCFullYear()}`}
          format="xof"
          icone={PiggyBank}
          valeur={produitsAnnee - chargesAnnee}
          detail={`marge ${produitsAnnee ? Math.round(((produitsAnnee - chargesAnnee) / produitsAnnee) * 100) : 0} %`}
          ton={produitsAnnee - chargesAnnee >= 0 ? "vert" : "cap"}
        />
      </div>

      <Panneau titre={`Évolution ${debut.getUTCFullYear()}`}>
        <BarresMensuelles
          mois={moisAnnee}
          series={[
            { nom: "Produits", ton: "desk", valeurs: encaisseParMois },
            { nom: "Charges", ton: "edu", valeurs: depenseParMois },
            { nom: "Résultat positif", ton: "vert", valeurs: resultatParMois },
          ]}
        />
      </Panneau>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panneau titre="Compte de résultat">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wide text-ink/50">
              <tr>
                <th className="py-2 text-left">Poste</th>
                <th className="text-right capitalize">{labelMois(debut)}</th>
                <th className="text-right">Cumul {debut.getUTCFullYear()}</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-ink/10 bg-desk/5 font-semibold">
                <td className="py-2" colSpan={3}>Produits</td>
              </tr>
              {TYPES_PAIEMENT.map((type) => (
                <tr key={type.value} className="border-t border-ink/5">
                  <td className="py-1.5 pl-3">{type.label}</td>
                  <td className="text-right tabular-nums">{xof(somme(paiementsMois.filter((p) => p.type === type.value)))}</td>
                  <td className="text-right tabular-nums">{xof(somme(paiements.filter((p) => p.type === type.value)))}</td>
                </tr>
              ))}
              <tr className="border-t border-ink/10 bg-edu/10 font-semibold">
                <td className="py-2" colSpan={3}>Charges</td>
              </tr>
              {CATEGORIES_DEPENSE.map((categorie) => {
                const mensuel = somme(depensesMois.filter((d) => d.categorie === categorie.value));
                const annuel = somme(depenses.filter((d) => d.categorie === categorie.value));
                if (!annuel) return null;
                return (
                  <tr key={categorie.value} className="border-t border-ink/5">
                    <td className="py-1.5 pl-3">{categorie.compte} · {categorie.label}</td>
                    <td className="text-right tabular-nums">{xof(mensuel)}</td>
                    <td className="text-right tabular-nums">{xof(annuel)}</td>
                  </tr>
                );
              })}
              <tr className="border-t-2 border-ink/20 font-semibold">
                <td className="py-2">Résultat</td>
                <td className={`text-right tabular-nums ${produitsMois - chargesMois >= 0 ? "text-emerald-700" : "text-cap"}`}>
                  {xof(produitsMois - chargesMois)}
                </td>
                <td className={`text-right tabular-nums ${produitsAnnee - chargesAnnee >= 0 ? "text-emerald-700" : "text-cap"}`}>
                  {xof(produitsAnnee - chargesAnnee)}
                </td>
              </tr>
            </tbody>
          </table>
        </Panneau>

        <div className="grid gap-4 self-start">
          <Panneau titre="Encaissements par moyen">
            <ul className="grid gap-2 text-sm">
              {MODES.map((mode) => (
                <li key={mode.value} className="flex justify-between border-t border-ink/5 pt-2 first:border-0 first:pt-0">
                  <span>{mode.label}</span>
                  <span className="font-semibold tabular-nums">{xof(somme(paiementsMois.filter((p) => p.mode === mode.value)))}</span>
                </li>
              ))}
            </ul>
          </Panneau>
          <Panneau titre="Exports Excel (CSV)">
            <p className="mb-3 text-sm text-ink/70">Les exports financiers portent sur le mois sélectionné, les listes sur l'ensemble.</p>
            <div className="flex flex-wrap gap-2">
              {EXPORTS.map((item) => (
                <a key={item.type} className="bouton-second" href={`/api/export/${item.type}?mois=${cleMois(debut)}`}>
                  <Download size={15} /> {item.label}
                </a>
              ))}
            </div>
          </Panneau>
        </div>
      </div>
    </section>
  );
}
