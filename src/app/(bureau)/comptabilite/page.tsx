import { redirect } from "next/navigation";
import { BookOpenCheck, CheckCircle2, Download, Landmark, Scale, Smartphone, TriangleAlert, Wallet } from "lucide-react";
import { prisma } from "@/lib/db";
import { cleMois, debutJourAbidjan, debutMois, formatDate, formatJour, nomComplet, xof } from "@/lib/format";
import { COMPTES, labelMode } from "@/lib/labels";
import { BoutonEnvoi, FormAction } from "@/components/formulaire";
import { Kpi } from "@/components/graphiques";
import { Badge, EnTete, Onglets, Vide } from "@/components/ui";
import { rapprocher } from "@/server/actions";
import { voitCompta } from "@/server/permissions";
import { requireUser } from "@/server/session";

export const metadata = { title: "Comptabilité" };

const ICONES_TRESORERIE = { "571": Wallet, "521": Landmark, "558": Smartphone } as const;
const JOURNAUX: Record<string, string> = { VTE: "Ventes", CAI: "Caisse", ACH: "Achats", AN: "À nouveau" };

export default async function ComptabilitePage({ searchParams }: { searchParams: Promise<{ periode?: string }> }) {
  const user = await requireUser();
  if (!voitCompta(user.role)) redirect("/missions");
  const { periode = "jour" } = await searchParams;
  const depuis = periode === "mois" ? debutMois(0) : debutJourAbidjan();
  const [ecritures, factures, aRapprocher, tresorerie] = await Promise.all([
    prisma.ecriture.findMany({ where: { date: { gte: depuis } }, orderBy: [{ date: "desc" }, { id: "asc" }], take: 300 }),
    prisma.facture.aggregate({ where: { creeLe: { gte: depuis } }, _sum: { montant: true } }),
    prisma.paiement.findMany({ where: { statut: "ENCAISSE" }, orderBy: { creeLe: "desc" }, take: 30, include: { client: true } }),
    prisma.ecriture.groupBy({ by: ["compte"], where: { compte: { in: ["571", "521", "558"] } }, _sum: { debit: true, credit: true } }),
  ]);
  const produit = ecritures.filter((ecriture) => ecriture.compte === "706").reduce((somme, ecriture) => somme + ecriture.credit, 0);
  const totalFactures = factures._sum.montant ?? 0;
  const equilibre = produit === totalFactures;
  const totalDebit = ecritures.reduce((somme, ecriture) => somme + ecriture.debit, 0);
  const totalCredit = ecritures.reduce((somme, ecriture) => somme + ecriture.credit, 0);
  const soldes = (["571", "521", "558"] as const).map((compte) => {
    const ligne = tresorerie.find((item) => item.compte === compte);
    return { compte, solde: (ligne?._sum.debit ?? 0) - (ligne?._sum.credit ?? 0) };
  });

  return (
    <section className="grid gap-6">
      <EnTete
        titre="Comptabilité"
        icone={BookOpenCheck}
        description="Les écritures sont générées automatiquement par les encaissements et les dépenses."
        actions={
          <a className="bouton-second" href={`/api/export/ecritures?mois=${cleMois(debutMois(0))}`}>
            <Download size={15} /> Export du mois
          </a>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {soldes.map(({ compte, solde }) => (
          <Kpi key={compte} titre={COMPTES[compte] ?? compte} valeur={solde} format="xof" icone={ICONES_TRESORERIE[compte]} detail={`Compte ${compte}`} ton={solde < 0 ? "cap" : "desk"} />
        ))}
        <Kpi titre="Trésorerie totale" valeur={soldes.reduce((somme, ligne) => somme + ligne.solde, 0)} format="xof" ton="vert" icone={Scale} />
      </div>

      <div className={`flex flex-wrap items-center gap-3 rounded-2xl px-5 py-4 text-sm ${equilibre ? "bg-vert/[0.07]" : "bg-cap/[0.07]"}`}>
        {equilibre ? <CheckCircle2 className="text-vert" size={20} /> : <TriangleAlert className="text-cap" size={20} />}
        <p>
          <span className="font-semibold">{equilibre ? "Contrôle équilibré" : "Écart détecté"}</span>
          <span className="text-ink/60"> · factures émises {xof(totalFactures)} · produits (706) {xof(produit)} · débit {xof(totalDebit)} / crédit {xof(totalCredit)}</span>
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid gap-3 self-start">
          <Onglets
            actif={`/comptabilite?periode=${periode}`}
            onglets={[
              { href: "/comptabilite?periode=jour", label: "Écritures du jour" },
              { href: "/comptabilite?periode=mois", label: "Écritures du mois" },
            ]}
          />
          {ecritures.length === 0 ? (
            <Vide icone={BookOpenCheck} titre="Aucune écriture sur la période" texte="Elles apparaîtront dès le prochain encaissement ou la prochaine dépense." />
          ) : (
            <div className="carte overflow-x-auto p-0">
              <table className="tableau min-w-[640px]">
                <thead>
                  <tr>
                    <th className="!pl-5">Date</th>
                    <th>Journal</th>
                    <th>Compte</th>
                    <th>Libellé</th>
                    <th className="text-right">Débit</th>
                    <th className="!pr-5 text-right">Crédit</th>
                  </tr>
                </thead>
                <tbody>
                  {ecritures.map((ecriture) => (
                    <tr key={ecriture.id}>
                      <td className="!pl-5 whitespace-nowrap text-ink/55">{formatJour(ecriture.date)}</td>
                      <td><Badge ton={ecriture.journal === "ACH" ? "mission" : ecriture.journal === "AN" ? "gris" : "desk"}>{JOURNAUX[ecriture.journal] ?? ecriture.journal}</Badge></td>
                      <td className="font-mono text-xs" title={COMPTES[ecriture.compte]}>{ecriture.compte}</td>
                      <td className="max-w-72 truncate">{ecriture.libelle}</td>
                      <td className="text-right tabular-nums">{ecriture.debit ? xof(ecriture.debit) : ""}</td>
                      <td className="!pr-5 text-right tabular-nums">{ecriture.credit ? xof(ecriture.credit) : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <article className="carte self-start">
          <h2 className="font-semibold">Paiements à rapprocher</h2>
          <p className="mt-0.5 text-xs text-ink/50">Cochez quand le paiement apparaît sur le relevé bancaire ou mobile money.</p>
          <div className="mt-4 grid gap-2">
            {aRapprocher.map((paiement) => (
              <FormAction key={paiement.id} action={rapprocher} succes="Paiement rapproché" className="flex items-center justify-between gap-3 rounded-xl border border-ink/[0.06] px-3 py-2.5 text-sm">
                <input type="hidden" name="paiementId" value={paiement.id} />
                <div className="min-w-0">
                  <p className="font-semibold tabular-nums">{xof(paiement.montant)} <span className="font-normal text-ink/50">· {labelMode(paiement.mode)}</span></p>
                  <p className="truncate text-xs text-ink/50">{nomComplet(paiement.client)} · {formatDate(paiement.dateEncaissement)}</p>
                </div>
                <BoutonEnvoi className="bouton-second shrink-0 px-3 py-1.5 text-xs" titre="Marquer rapproché">
                  <CheckCircle2 size={14} /> OK
                </BoutonEnvoi>
              </FormAction>
            ))}
            {aRapprocher.length === 0 ? <p className="py-6 text-center text-sm text-ink/50">Tout est rapproché.</p> : null}
          </div>
        </article>
      </div>
    </section>
  );
}
