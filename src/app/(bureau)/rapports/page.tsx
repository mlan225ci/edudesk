import { redirect } from "next/navigation";
import { Download, FileBarChart, FileDown, FolderPlus, GraduationCap, Scale, Target, Timer, TrendingDown, TrendingUp } from "lucide-react";
import { EnTete } from "@/components/ui";
import { variation, xof } from "@/lib/format";
import { BarresHorizontales, BarresMensuelles, Kpi, Panneau } from "@/components/graphiques";
import { Filtres } from "@/components/filtres";
import { voitRapports } from "@/server/permissions";
import { requireUser } from "@/server/session";
import { TYPES_PERIODE, calculerStatistiques, lirePeriode, periodePrecedente, periodesRecentes } from "@/server/statistiques";

const EXPORTS = [
  { type: "paiements", label: "Encaissements" },
  { type: "depenses", label: "Dépenses" },
  { type: "ecritures", label: "Écritures comptables" },
  { type: "dossiers", label: "Dossiers" },
  { type: "clients", label: "Clients" },
  { type: "prospects", label: "Prospects" },
];

const NOMBRE_CHOIX = { semaine: 26, mois: 24, trimestre: 12, semestre: 8, annee: 6 } as const;

export const metadata = { title: "Rapports" };

export default async function RapportsPage({ searchParams }: { searchParams: Promise<{ periode?: string; cle?: string; mois?: string }> }) {
  const user = await requireUser();
  if (!voitRapports(user.role)) redirect("/tableau-de-bord");
  const { periode: type, cle, mois } = await searchParams;
  const periode = lirePeriode(type, cle ?? mois);
  const precedente = periodePrecedente(periode);
  const [stats, avant] = await Promise.all([calculerStatistiques(periode), calculerStatistiques(precedente)]);
  const choix = periodesRecentes(periode.type, NOMBRE_CHOIX[periode.type]);
  if (!choix.some((item) => item.cle === periode.cle)) choix.unshift(periode);
  const requete = `periode=${periode.type}&cle=${periode.cle}`;
  const { finances, commercial, operations } = stats;
  const conversion = commercial.prospects ? Math.round((commercial.convertis / commercial.prospects) * 100) : null;

  return (
    <section className="grid gap-6">
      <EnTete
        titre="Rapports"
        icone={FileBarChart}
        surTitre={periode.libelle}
        description={`Activité, finances et équipe sur la période, comparées à la précédente (${precedente.libelle.toLowerCase()}).`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Filtres className="flex flex-wrap gap-2" action="/rapports">
              <select key={`type-${periode.type}`} className="champ w-auto" name="periode" defaultValue={periode.type} aria-label="Type de période">
                {TYPES_PERIODE.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
              <select key={`cle-${periode.cle}`} className="champ w-auto capitalize" name="cle" defaultValue={periode.cle} aria-label="Période">
                {choix.map((item) => (
                  <option key={item.cle} value={item.cle}>{item.libelle}</option>
                ))}
              </select>
            </Filtres>
            <a href={`/api/rapport?${requete}`} target="_blank" rel="noreferrer" className="bouton">
              <FileDown size={16} /> Rapport PDF
            </a>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi titre="Produits encaissés" valeur={finances.produits} format="xof" ton="desk" icone={TrendingUp} evolution={variation(finances.produits, avant.finances.produits)} detail={`${finances.nombreEncaissements} encaissement(s)`} />
        <Kpi titre="Charges" valeur={finances.charges} format="xof" ton="mission" icone={TrendingDown} evolution={variation(finances.charges, avant.finances.charges)} inverse />
        <Kpi
          titre="Résultat"
          valeur={finances.resultat}
          format="xof"
          ton={finances.resultat >= 0 ? "vert" : "cap"}
          icone={Scale}
          detail={finances.produits ? `marge ${Math.round((finances.resultat / finances.produits) * 100)} %` : undefined}
        />
        <Kpi titre="Dossiers ouverts" valeur={commercial.dossiers} icone={FolderPlus} evolution={variation(commercial.dossiers, avant.commercial.dossiers)} detail={`${commercial.clients} nouveau(x) client(s)`} />
        <Kpi titre="Prospects" valeur={commercial.prospects} icone={Target} evolution={variation(commercial.prospects, avant.commercial.prospects)} detail={conversion != null ? `${conversion} % convertis` : undefined} />
        <Kpi titre="Étapes clôturées" valeur={operations.etapesCloturees} icone={Timer} evolution={variation(operations.etapesCloturees, avant.operations.etapesCloturees)} detail={operations.tauxATemps != null ? `${operations.tauxATemps} % dans les délais` : undefined} ton={operations.tauxATemps != null && operations.tauxATemps < 70 ? "cap" : "ink"} />
        <Kpi titre="Admissions et visas" valeur={`${operations.admissions} · ${operations.visas}`} icone={GraduationCap} detail="admissions · visas obtenus" />
        <Kpi titre="Devis acceptés" valeur={commercial.montantAcceptes} format="xof" detail={`${commercial.devisAcceptes} sur ${commercial.devisEmis} émis`} ton="vert" />
      </div>

      <Panneau titre={`Évolution · ${periode.libelle}`}>
        <BarresMensuelles
          mois={finances.subdivisions}
          series={[
            { nom: "Produits", ton: "desk", valeurs: finances.produitsParSubdivision },
            { nom: "Charges", ton: "edu", valeurs: finances.chargesParSubdivision },
          ]}
        />
      </Panneau>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panneau titre="Compte de résultat">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wide text-ink/50">
              <tr>
                <th className="py-2 text-left">Poste</th>
                <th className="text-right">Période</th>
                <th className="text-right">Précédente</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-ink/10 bg-desk/5 font-semibold">
                <td className="py-2" colSpan={3}>Produits</td>
              </tr>
              {finances.parType.map((ligne, index) => (
                <tr key={ligne.label} className="border-t border-ink/5">
                  <td className="py-1.5 pl-3">{ligne.label}</td>
                  <td className="text-right tabular-nums">{xof(ligne.montant)}</td>
                  <td className="text-right tabular-nums text-ink/50">{xof(avant.finances.parType[index]?.montant ?? 0)}</td>
                </tr>
              ))}
              <tr className="border-t border-ink/10 bg-edu/10 font-semibold">
                <td className="py-2" colSpan={3}>Charges</td>
              </tr>
              {finances.parCategorie.length === 0 ? (
                <tr className="border-t border-ink/5"><td className="py-1.5 pl-3 text-ink/45" colSpan={3}>Aucune dépense</td></tr>
              ) : (
                finances.parCategorie.map((ligne) => (
                  <tr key={ligne.label} className="border-t border-ink/5">
                    <td className="py-1.5 pl-3">{ligne.label}</td>
                    <td className="text-right tabular-nums">{xof(ligne.montant)}</td>
                    <td className="text-right tabular-nums text-ink/50">{xof(avant.finances.parCategorie.find((item) => item.label === ligne.label)?.montant ?? 0)}</td>
                  </tr>
                ))
              )}
              <tr className="border-t-2 border-ink/20 font-semibold">
                <td className="py-2">Résultat</td>
                <td className={`text-right tabular-nums ${finances.resultat >= 0 ? "text-emerald-700" : "text-cap"}`}>{xof(finances.resultat)}</td>
                <td className="text-right tabular-nums text-ink/50">{xof(avant.finances.resultat)}</td>
              </tr>
            </tbody>
          </table>
        </Panneau>

        <div className="grid gap-4 self-start">
          <Panneau titre="Dossiers ouverts par procédure">
            {commercial.parProcedure.length ? (
              <BarresHorizontales donnees={commercial.parProcedure.map(([label, valeur]) => ({ label, valeur }))} />
            ) : (
              <p className="text-sm text-ink/50">Aucun dossier ouvert sur la période.</p>
            )}
          </Panneau>
          <Panneau titre="Prospects par source">
            {commercial.parSource.length ? (
              <BarresHorizontales donnees={commercial.parSource.map(([label, valeur]) => ({ label, valeur }))} ton="mission" />
            ) : (
              <p className="text-sm text-ink/50">Aucun prospect sur la période.</p>
            )}
          </Panneau>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panneau titre="Équipe : étapes clôturées">
          {operations.equipe.length ? (
            <table className="tableau">
              <thead>
                <tr>
                  <th>Collaborateur</th>
                  <th className="text-right">Clôturées</th>
                  <th className="text-right">Dont en retard</th>
                </tr>
              </thead>
              <tbody>
                {operations.equipe.map((ligne) => (
                  <tr key={ligne.nom}>
                    <td className="font-medium">{ligne.nom}</td>
                    <td className="text-right tabular-nums">{ligne.clotures}</td>
                    <td className={`text-right tabular-nums ${ligne.retards ? "font-semibold text-cap" : "text-ink/45"}`}>{ligne.retards}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-ink/50">Aucune étape clôturée sur la période.</p>
          )}
        </Panneau>

        <div className="grid gap-4 self-start">
          <Panneau titre="Encaissements par moyen">
            <ul className="grid gap-2 text-sm">
              {finances.parMode.map((ligne) => (
                <li key={ligne.label} className="flex justify-between border-t border-ink/5 pt-2 first:border-0 first:pt-0">
                  <span>{ligne.label}</span>
                  <span className="font-semibold tabular-nums">{xof(ligne.montant)}</span>
                </li>
              ))}
            </ul>
          </Panneau>
          <Panneau titre="Exports Excel (CSV)">
            <p className="mb-3 text-sm text-ink/70">Les exports financiers portent sur la période sélectionnée, les listes sur l&apos;ensemble.</p>
            <div className="flex flex-wrap gap-2">
              {EXPORTS.map((item) => (
                <a key={item.type} className="bouton-second" href={`/api/export/${item.type}?${requete}`}>
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
