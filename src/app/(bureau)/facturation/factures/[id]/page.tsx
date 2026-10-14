import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Ban, Banknote, FileDown, Mail, ReceiptText, Send } from "lucide-react";
import { prisma } from "@/lib/db";
import { etatFacture } from "@/lib/facturation";
import { formatJour, nomComplet, xof } from "@/lib/format";
import { MODES, TYPES_PAIEMENT, labelMode } from "@/lib/labels";
import { Formulaire } from "@/components/formulaire";
import { Tiroir } from "@/components/tiroir";
import { Badge, Champ, Choix, EnTete, Info, Progression } from "@/components/ui";
import { envoyerFactureParMail } from "@/server/communication-actions";
import { annulerFactureAction, reglerFacture } from "@/server/facturation-actions";
import { peutAnnulerFacture, peutEncaisser, voitFinance } from "@/server/permissions";
import { requireUser } from "@/server/session";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const facture = await prisma.facture.findUnique({ where: { id }, select: { numero: true } });
  return { title: facture ? `Facture ${facture.numero}` : "Facture" };
}

export default async function FacturePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!voitFinance(user.role)) notFound();
  const { id } = await params;
  const facture = await prisma.facture.findUnique({
    where: { id },
    include: {
      paiement: true,
      reglements: { orderBy: { dateEncaissement: "asc" } },
      devis: { select: { id: true, numero: true } },
      dossier: { include: { client: true, procedure: true } },
    },
  });
  if (!facture) notFound();
  const auteurId = facture.creeParId ?? facture.paiement?.saisiParId;
  const auteur = auteurId ? await prisma.user.findUnique({ where: { id: auteurId }, select: { prenom: true, nom: true } }) : null;
  const paiements = facture.paiement ? [facture.paiement] : facture.reglements;
  const regle = paiements.reduce((somme, paiement) => somme + paiement.montant, 0);
  const reste = Math.max(facture.montant - regle, 0);
  const etat = etatFacture({ montant: facture.montant, regle, annuleeLe: facture.annuleeLe, echeanceLe: facture.echeanceLe });
  const recu = Boolean(facture.paiementId);
  const client = facture.dossier.client;
  const reglable = peutEncaisser(user.role) && !recu && !facture.annuleeLe && reste > 0;
  const annulable = peutAnnulerFacture(user.role) && !recu && !facture.annuleeLe && paiements.length === 0;

  const details: [string, React.ReactNode][] = [
    ["Client", client.email ? `${facture.clientNom} · ${client.email}` : facture.clientNom],
    ["Dossier", <Link key="dossier" href={`/dossiers/${facture.dossierId}`} className="font-semibold text-desk hover:underline">{facture.dossier.reference}</Link>],
    ["Émise le", `${formatJour(facture.creeLe)}${auteur ? ` par ${nomComplet(auteur)}` : ""}`],
    ["Échéance", recu ? "Acquittée à l'émission" : facture.echeanceLe ? formatJour(facture.echeanceLe) : "À réception"],
  ];
  if (facture.devis) {
    details.push(["Devis d'origine", <Link key="devis" href={`/facturation/devis/${facture.devis.id}`} className="font-semibold text-desk hover:underline">{facture.devis.numero}</Link>]);
  }
  details.push(["Envoyée au client", facture.envoyeeLe ? formatJour(facture.envoyeeLe) : "Pas encore"]);

  return (
    <section className="grid gap-6">
      <Link href="/facturation?vue=factures" className="bouton-fantome -ml-2.5 w-fit">
        <ArrowLeft size={16} /> Devis et factures
      </Link>
      <EnTete
        surTitre={recu ? "Reçu de paiement" : "Facture"}
        titre={facture.numero}
        icone={ReceiptText}
        description={facture.libelle}
        actions={
          <>
            <a href={`/api/pdf/facture/${facture.id}?telecharger=1`} className="bouton-second">
              <FileDown size={16} /> Télécharger
            </a>
            {facture.annuleeLe ? null : (
              <Tiroir label="Envoyer" variante="second" icone={<Mail size={16} />} titre={`Envoyer la facture ${facture.numero}`} description="La facture part en PDF, en pièce jointe, avec la situation des règlements.">
                <Formulaire action={envoyerFactureParMail} submit="Envoyer" succes="Facture envoyée par e-mail" icone={<Send size={15} />}>
                  <input type="hidden" name="factureId" value={facture.id} />
                  <Champ label="Adresse du destinataire" aide={client.email ? "Adresse de la fiche client." : "Aucune adresse sur la fiche client."}>
                    <input className="champ" type="email" name="email" defaultValue={client.email ?? ""} required />
                  </Champ>
                </Formulaire>
              </Tiroir>
            )}
            {reglable ? (
              <Tiroir label="Enregistrer un règlement" icone={<Banknote size={16} />} titre={`Règlement de la facture ${facture.numero}`} description="L'encaissement est rattaché à cette facture et passé en comptabilité.">
                <Formulaire action={reglerFacture} submit="Enregistrer le règlement" succes="Règlement enregistré" className="grid gap-4">
                  <input type="hidden" name="factureId" value={facture.id} />
                  <Champ label="Montant (F CFA)" aide={`Reste à payer : ${xof(reste)}`}>
                    <input className="champ text-lg font-semibold" name="montant" inputMode="numeric" defaultValue={reste} required />
                  </Champ>
                  <Champ label="Nature">
                    <select className="champ" name="type" defaultValue="FRAIS">
                      {TYPES_PAIEMENT.map((type) => (
                        <option key={type.value} value={type.value}>{type.label}</option>
                      ))}
                    </select>
                  </Champ>
                  <Choix label="Moyen de paiement" name="mode" options={MODES} />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Champ label="Précision"><input className="champ" name="precision" placeholder="Wave, Orange…" /></Champ>
                    <Champ label="N° de reçu"><input className="champ" name="referenceExterne" placeholder="Facultatif" /></Champ>
                  </div>
                  <Champ label="Date"><input className="champ" type="date" name="date" required defaultValue={new Date().toISOString().slice(0, 10)} /></Champ>
                </Formulaire>
              </Tiroir>
            ) : null}
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="carte overflow-hidden p-0">
          <iframe src={`/api/pdf/facture/${facture.id}#view=FitH`} title={`Facture ${facture.numero}`} className="h-[78vh] min-h-[560px] w-full bg-paper" />
        </div>

        <aside className="grid h-fit gap-4 xl:sticky xl:top-24">
          <article className="carte">
            <div className="flex items-center justify-between gap-3">
              <Badge ton={etat.ton} point>{etat.label}</Badge>
              <p className={`text-2xl font-bold tabular-nums ${facture.annuleeLe ? "text-ink/40 line-through" : ""}`}>{xof(facture.montant)}</p>
            </div>
            {facture.annuleeLe ? (
              <p className="mt-3 rounded-xl bg-ink/[0.04] px-3.5 py-2.5 text-sm text-ink/70">
                Annulée le {formatJour(facture.annuleeLe)}{facture.motifAnnulation ? ` : ${facture.motifAnnulation}` : ""}
              </p>
            ) : (
              <div className="mt-4 grid gap-2">
                <Progression valeur={facture.montant ? (regle / facture.montant) * 100 : 0} ton={reste === 0 ? "vert" : etat.code === "EN_RETARD" ? "cap" : "desk"} />
                <div className="flex justify-between text-sm">
                  <span className="text-ink/55">Réglé <strong className="text-vert tabular-nums">{xof(regle)}</strong></span>
                  <span className="text-ink/55">Reste <strong className={`tabular-nums ${reste ? "text-cap" : "text-ink/40"}`}>{xof(reste)}</strong></span>
                </div>
              </div>
            )}
            <dl className="mt-4 grid gap-2.5 text-sm">
              {details.map(([libelle, valeur]) => (
                <div key={libelle} className="flex items-start justify-between gap-3 border-t border-ink/[0.06] pt-2.5">
                  <dt className="text-ink/50">{libelle}</dt>
                  <dd className="text-right font-medium">{valeur}</dd>
                </div>
              ))}
            </dl>
          </article>

          <article className="carte">
            <p className="text-sm font-semibold">Règlements</p>
            {paiements.length === 0 ? (
              <p className="mt-2 text-sm text-ink/50">Aucun règlement reçu pour l'instant.</p>
            ) : (
              <ul className="mt-3 grid gap-2">
                {paiements.map((paiement) => (
                  <li key={paiement.id} className="flex items-center justify-between gap-3 rounded-xl bg-paper px-3.5 py-2.5 text-sm">
                    <span className="min-w-0">
                      <span className="block font-medium">{formatJour(paiement.dateEncaissement)} · {labelMode(paiement.mode)}</span>
                      <span className="block truncate text-xs text-ink/50">
                        {paiement.numero}
                        {paiement.precision ? ` · ${paiement.precision}` : ""}
                        {paiement.referenceExterne ? ` · ${paiement.referenceExterne}` : ""}
                      </span>
                    </span>
                    <span className="font-semibold text-vert tabular-nums">{xof(paiement.montant)}</span>
                  </li>
                ))}
              </ul>
            )}
          </article>

          {annulable ? (
            <Tiroir label="Annuler la facture" variante="second" icone={<Ban size={16} />} titre={`Annuler la facture ${facture.numero}`} description="La facture reste numérotée et consultable, marquée « annulée ». Cette action est définitive.">
              <Formulaire action={annulerFactureAction} submit="Annuler la facture" succes="Facture annulée" className="grid gap-4">
                <input type="hidden" name="factureId" value={facture.id} />
                <Champ label="Motif">
                  <textarea className="champ" name="motif" rows={3} placeholder="Erreur de montant, prestation abandonnée…" required />
                </Champ>
                <Info>Pour corriger une facture, annulez-la puis émettez-en une nouvelle.</Info>
              </Formulaire>
            </Tiroir>
          ) : null}
        </aside>
      </div>
    </section>
  );
}
