import { redirect } from "next/navigation";
import { BookOpen } from "lucide-react";
import { prisma } from "@/lib/db";
import { CATEGORIES_DEPENSE, COMPTES, MODES } from "@/lib/labels";
import { EnTete, Info } from "@/components/ui";
import { voitCompta } from "@/server/permissions";
import { requireUser } from "@/server/session";

export const metadata = { title: "Comptabilité · Paramètres" };

const SERIES: Record<string, string> = { DOS: "Dossiers", PAY: "Paiements", FAC: "Factures", DEP: "Dépenses" };

function serie(cle: string) {
  const [prefixe, annee] = cle.split("-");
  return `${SERIES[prefixe] ?? prefixe} ${annee ?? ""}`.trim();
}

function Compte({ numero }: { numero: string }) {
  return (
    <span className="whitespace-nowrap">
      <span className="font-mono text-xs font-semibold">{numero}</span> <span className="text-ink/55">{COMPTES[numero] ?? ""}</span>
    </span>
  );
}

export default async function ParametresComptabilitePage() {
  const user = await requireUser();
  if (!voitCompta(user.role)) redirect("/parametres");
  const compteurs = await prisma.compteur.findMany({ orderBy: { cle: "asc" } });

  return (
    <section className="grid gap-6">
      <EnTete
        titre="Comptabilité"
        icone={BookOpen}
        surTitre="Paramètres"
        description="Les comptes utilisés pour passer automatiquement les écritures des encaissements et des dépenses (plan SYSCOHADA)."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <article className="carte overflow-x-auto p-0 self-start">
          <h2 className="px-5 pt-4 font-semibold">Plan comptable</h2>
          <table className="tableau mt-2">
            <thead>
              <tr>
                <th className="!pl-5">Compte</th>
                <th className="!pr-5">Intitulé</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(COMPTES).map(([numero, intitule]) => (
                <tr key={numero}>
                  <td className="!pl-5 font-mono text-xs font-semibold">{numero}</td>
                  <td className="!pr-5">{intitule}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>

        <div className="grid gap-6 self-start">
          <article className="carte overflow-x-auto p-0">
            <h2 className="px-5 pt-4 font-semibold">Encaissements</h2>
            <p className="px-5 text-xs text-ink/50">Vente : 411 Clients au débit, 706 Prestations au crédit. Encaissement : compte de trésorerie au débit, 411 au crédit.</p>
            <table className="tableau mt-2">
              <thead>
                <tr>
                  <th className="!pl-5">Mode de règlement</th>
                  <th className="!pr-5">Compte de trésorerie</th>
                </tr>
              </thead>
              <tbody>
                {MODES.map((mode) => (
                  <tr key={mode.value}>
                    <td className="!pl-5">{mode.label}</td>
                    <td className="!pr-5"><Compte numero={mode.compte} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </article>

          <article className="carte overflow-x-auto p-0">
            <h2 className="px-5 pt-4 font-semibold">Dépenses</h2>
            <p className="px-5 text-xs text-ink/50">Débit du compte de charge, crédit du compte de trésorerie utilisé.</p>
            <table className="tableau mt-2">
              <thead>
                <tr>
                  <th className="!pl-5">Catégorie</th>
                  <th className="!pr-5">Compte de charge</th>
                </tr>
              </thead>
              <tbody>
                {CATEGORIES_DEPENSE.map((categorie) => (
                  <tr key={categorie.value}>
                    <td className="!pl-5">{categorie.label}</td>
                    <td className="!pr-5"><Compte numero={categorie.compte} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </article>

          {compteurs.length > 0 ? (
            <article className="carte">
              <h2 className="font-semibold">Numérotation</h2>
              <p className="text-xs text-ink/50">Dernier numéro attribué par série ; la numérotation repart à 1 chaque année.</p>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
                {compteurs.map((compteur) => (
                  <div key={compteur.cle} className="rounded-xl bg-paper px-3 py-2">
                    <dt className="truncate text-xs text-ink/50">{serie(compteur.cle)}</dt>
                    <dd className="font-bold tabular-nums">{compteur.valeur}</dd>
                  </div>
                ))}
              </dl>
            </article>
          ) : null}
        </div>
      </div>

      <Info>Ces correspondances sont fixées pour garantir des écritures cohérentes d'une période à l'autre. Pour ajouter un compte ou une catégorie de dépense, demandez une évolution de l'application.</Info>
    </section>
  );
}
