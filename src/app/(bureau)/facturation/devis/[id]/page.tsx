import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Check, FileDown, FileSignature, Mail, ReceiptText, Send, Trash2, X } from "lucide-react";
import { prisma } from "@/lib/db";
import { etatDevis, lireLignes } from "@/lib/facturation";
import { formatJour, nomComplet, xof } from "@/lib/format";
import { BoutonEnvoi, FormAction, Formulaire } from "@/components/formulaire";
import { Tiroir } from "@/components/tiroir";
import { Badge, Champ, EnTete, Info } from "@/components/ui";
import { deciderDevis, envoyerDevis } from "@/server/devis-actions";
import { supprimerDevisEtRevenir, transformerDevis } from "@/server/facturation-actions";
import { peutDevis, peutFacturer, voitFinance } from "@/server/permissions";
import { requireUser } from "@/server/session";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const devis = await prisma.devis.findUnique({ where: { id }, select: { numero: true } });
  return { title: devis ? `Devis ${devis.numero}` : "Devis" };
}

export default async function DevisPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!peutDevis(user.role)) redirect("/");
  const { id } = await params;
  const devis = await prisma.devis.findUnique({
    where: { id },
    include: { dossier: { include: { client: true, procedure: true } }, facture: { select: { id: true, numero: true, creeLe: true } } },
  });
  if (!devis) notFound();
  const auteur = await prisma.user.findUnique({ where: { id: devis.creeParId }, select: { prenom: true, nom: true } });
  const etat = etatDevis(devis);
  const lignes = lireLignes(devis.lignes);
  const client = devis.dossier.client;
  const ouvert = devis.statut === "EMIS" && !devis.facture;
  const facturable = peutFacturer(user.role) && !devis.facture && devis.statut !== "REFUSE";

  const details: [string, React.ReactNode][] = [
    ["Client", client.email ? `${devis.clientNom} · ${client.email}` : devis.clientNom],
    ["Dossier", <Link key="dossier" href={`/dossiers/${devis.dossierId}`} className="font-semibold text-desk hover:underline">{devis.dossier.reference}</Link>],
    ["Prestation", devis.dossier.procedure.nom],
    ["Établi le", `${formatJour(devis.creeLe)}${auteur ? ` par ${nomComplet(auteur)}` : ""}`],
    ["Valable jusqu'au", devis.validiteLe ? formatJour(devis.validiteLe) : "—"],
    ["Envoyé au client", devis.envoyeLe ? formatJour(devis.envoyeLe) : "Pas encore"],
  ];
  if (devis.decideLe) details.push([devis.statut === "REFUSE" ? "Refusé le" : "Accepté le", formatJour(devis.decideLe)]);

  return (
    <section className="grid gap-6">
      <Link href="/facturation" className="bouton-fantome -ml-2.5 w-fit">
        <ArrowLeft size={16} /> Devis et factures
      </Link>
      <EnTete
        surTitre="Devis"
        titre={devis.numero}
        icone={FileSignature}
        description={devis.objet}
        actions={
          <>
            <a href={`/api/pdf/devis/${devis.id}?telecharger=1`} className="bouton-second">
              <FileDown size={16} /> Télécharger
            </a>
            <Tiroir label="Envoyer" variante="second" icone={<Mail size={16} />} titre={`Envoyer le devis ${devis.numero}`} description="Le devis part en PDF, en pièce jointe, avec un SMS de prévenance.">
              <Formulaire action={envoyerDevis} submit="Envoyer" succes="Devis envoyé" icone={<Send size={15} />}>
                <input type="hidden" name="devisId" value={devis.id} />
                <Champ label="Adresse du destinataire">
                  <input className="champ" type="email" name="email" defaultValue={client.email ?? ""} required />
                </Champ>
              </Formulaire>
            </Tiroir>
            {facturable ? (
              <Tiroir
                label="Transformer en facture"
                icone={<ReceiptText size={16} />}
                titre={`Facturer le devis ${devis.numero}`}
                description="Une facture est émise avec les mêmes lignes, le même objet et les mêmes conditions. Le devis passe à « Facturé »."
              >
                <Formulaire action={transformerDevis} submit="Émettre la facture" succes="Facture émise à partir du devis" className="grid gap-4">
                  <input type="hidden" name="devisId" value={devis.id} />
                  <div className="rounded-2xl bg-paper px-4 py-3">
                    <p className="text-xs text-ink/50">Montant de la facture</p>
                    <p className="text-2xl font-bold tabular-nums">{xof(devis.total)}</p>
                    <p className="text-xs text-ink/50">{lignes.length} ligne(s) · {devis.clientNom}</p>
                  </div>
                  <Champ label="Échéance (jours)" aide="Laissez vide pour une facture payable à réception.">
                    <input className="champ" name="echeance" inputMode="numeric" defaultValue="15" />
                  </Champ>
                  {devis.statut === "EMIS" ? <Info>Le devis sera aussi marqué « accepté » et son total deviendra le montant convenu du dossier.</Info> : null}
                </Formulaire>
              </Tiroir>
            ) : null}
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="carte overflow-hidden p-0">
          <iframe src={`/api/pdf/devis/${devis.id}#view=FitH`} title={`Devis ${devis.numero}`} className="h-[78vh] min-h-[560px] w-full bg-paper" />
        </div>

        <aside className="grid h-fit gap-4 xl:sticky xl:top-24">
          <article className="carte">
            <div className="flex items-center justify-between gap-3">
              <Badge ton={etat.ton} point>{etat.label}</Badge>
              <p className="text-2xl font-bold tabular-nums">{xof(devis.total)}</p>
            </div>
            <dl className="mt-4 grid gap-2.5 text-sm">
              {details.map(([libelle, valeur]) => (
                <div key={libelle} className="flex items-start justify-between gap-3 border-t border-ink/[0.06] pt-2.5">
                  <dt className="text-ink/50">{libelle}</dt>
                  <dd className="text-right font-medium">{valeur}</dd>
                </div>
              ))}
            </dl>
          </article>

          {devis.facture ? (
            <div className="carte relative flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-desk/10 text-desk"><ReceiptText size={18} /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs text-ink/50">Transformé en facture le {formatJour(devis.facture.creeLe)}</span>
                <span className="block font-semibold">{devis.facture.numero}</span>
              </span>
              {voitFinance(user.role) ? (
                <Link href={`/facturation/factures/${devis.facture.id}`} className="text-sm font-semibold text-desk after:absolute after:inset-0">
                  Ouvrir
                </Link>
              ) : null}
            </div>
          ) : null}

          {ouvert ? (
            <article className="carte grid gap-3">
              <p className="text-sm font-semibold">Réponse du client</p>
              <div className="grid grid-cols-2 gap-2">
                <FormAction action={deciderDevis.bind(null, devis.id, "ACCEPTE")} succes="Devis accepté, montant convenu mis à jour">
                  <BoutonEnvoi className="bouton-second w-full text-vert">
                    <Check size={15} /> Accepté
                  </BoutonEnvoi>
                </FormAction>
                <FormAction action={deciderDevis.bind(null, devis.id, "REFUSE")} succes="Devis marqué refusé">
                  <BoutonEnvoi className="bouton-second w-full text-ink/60">
                    <X size={15} /> Refusé
                  </BoutonEnvoi>
                </FormAction>
              </div>
              <FormAction action={supprimerDevisEtRevenir.bind(null, devis.id)} confirmer={`Supprimer définitivement le devis ${devis.numero} ?`}>
                <BoutonEnvoi className="bouton-fantome w-full text-ink/45 hover:text-cap">
                  <Trash2 size={15} /> Supprimer le devis
                </BoutonEnvoi>
              </FormAction>
            </article>
          ) : null}
        </aside>
      </div>
    </section>
  );
}
