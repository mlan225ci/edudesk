import Link from "next/link";
import { redirect } from "next/navigation";
import { Banknote, Receipt, Wallet } from "lucide-react";
import { prisma } from "@/lib/db";
import { debutJourAbidjan, formatDate, nomComplet, xof } from "@/lib/format";
import { MODES, TYPES_PAIEMENT, labelMode, labelTypePaiement } from "@/lib/labels";
import { Formulaire } from "@/components/formulaire";
import { Kpi } from "@/components/graphiques";
import { Avatar, Badge, Champ, Choix, EnTete, Info, Vide } from "@/components/ui";
import { encaisser } from "@/server/actions";
import { peutEncaisser } from "@/server/permissions";
import { requireUser } from "@/server/session";
import { situationDossiers } from "@/server/stats";

export const metadata = { title: "Caisse" };

export default async function CaissePage({ searchParams }: { searchParams: Promise<{ dossier?: string }> }) {
  const user = await requireUser();
  if (!peutEncaisser(user.role)) redirect("/missions");
  const { dossier: dossierChoisi } = await searchParams;
  const depuis = debutJourAbidjan();
  const [situation, paiements] = await Promise.all([
    situationDossiers(),
    prisma.paiement.findMany({
      where: { creeLe: { gte: depuis } },
      include: { facture: true, factureReglee: true, client: true },
      orderBy: { creeLe: "desc" },
    }),
  ]);
  const total = paiements.reduce((somme, paiement) => somme + paiement.montant, 0);
  const parMode = MODES.map((mode) => ({
    ...mode,
    total: paiements.filter((paiement) => paiement.mode === mode.value).reduce((somme, paiement) => somme + paiement.montant, 0),
  }));
  const dossiers = [...situation].sort((a, b) => b.reste - a.reste);

  return (
    <section className="grid gap-6">
      <EnTete
        titre="Caisse"
        icone={Wallet}
        description="Enregistrez un paiement : la facture et l'écriture comptable sont créées automatiquement."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi titre="Encaissé aujourd'hui" valeur={total} format="xof" ton="vert" icone={Banknote} detail={`${paiements.length} paiement(s)`} />
        {parMode.map((mode) => (
          <Kpi key={mode.value} titre={mode.label} valeur={mode.total} format="xof" />
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
        <article className="carte h-fit lg:sticky lg:top-24">
          <h2 className="text-lg font-bold">Nouvel encaissement</h2>
          <Formulaire action={encaisser} submit="Encaisser et générer la facture" succes="Paiement enregistré, facture prête" className="mt-4 grid gap-4">
            <Champ label="Dossier" aide="Les dossiers avec un reste à payer apparaissent en premier.">
              <select className="champ" name="dossierId" required defaultValue={dossierChoisi ?? ""}>
                <option value="" disabled>Choisir le client…</option>
                {dossiers.map(({ dossier, reste }) => (
                  <option key={dossier.id} value={dossier.id}>
                    {nomComplet(dossier.client)} · {dossier.reference}
                    {reste > 0 ? ` · reste ${xof(reste)}` : ""}
                  </option>
                ))}
              </select>
            </Champ>
            <Champ label="Nature">
              <select className="champ" name="type" defaultValue="ACOMPTE_DOSSIER">
                {TYPES_PAIEMENT.map((type) => (
                  <option key={type.value} value={type.value}>{type.label}</option>
                ))}
              </select>
            </Champ>
            <Champ label="Montant (F CFA)">
              <input className="champ text-lg font-semibold" name="montant" inputMode="numeric" placeholder="0" required />
            </Champ>
            <Choix label="Moyen de paiement" name="mode" options={MODES} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Champ label="Précision"><input className="champ" name="precision" placeholder="Wave, Orange…" /></Champ>
              <Champ label="N° de reçu"><input className="champ" name="referenceExterne" placeholder="Facultatif" /></Champ>
            </div>
            <Champ label="Date"><input className="champ" type="date" name="date" required defaultValue={new Date().toISOString().slice(0, 10)} /></Champ>
          </Formulaire>
        </article>

        <div className="grid gap-3 self-start">
          <h2 className="text-lg font-bold">Journal du jour</h2>
          {paiements.length === 0 ? (
            <Vide icone={Receipt} titre="Aucun encaissement aujourd'hui" texte="Les paiements enregistrés s'afficheront ici avec leur facture." />
          ) : (
            <div className="grid gap-2 entree-cascade">
              {paiements.map((paiement) => {
                const facture = paiement.facture ?? paiement.factureReglee;
                return (
                  <article key={paiement.id} className="carte flex items-center gap-4 py-4">
                    <Avatar prenom={paiement.client.prenom} nom={paiement.client.nom} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{nomComplet(paiement.client)}</p>
                      <p className="truncate text-xs text-ink/50">
                        {labelTypePaiement(paiement.type)} · {paiement.numero} · {formatDate(paiement.creeLe)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold tabular-nums text-vert">+{xof(paiement.montant)}</p>
                      <Badge ton="gris">{labelMode(paiement.mode)}{paiement.precision ? ` · ${paiement.precision}` : ""}</Badge>
                    </div>
                    {facture ? (
                      <Link className="bouton-second px-3" href={`/facturation/factures/${facture.id}`} title={`Facture ${facture.numero}`}>
                        <Receipt size={16} />
                      </Link>
                    ) : null}
                  </article>
                );
              })}
            </div>
          )}
          <Info>Astuce : depuis un dossier, le bouton « Encaisser » pré-remplit le client et le reste à payer.</Info>
        </div>
      </div>
    </section>
  );
}
