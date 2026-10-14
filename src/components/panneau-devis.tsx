import { Check, FileDown, FilePlus2, FileSignature, Mail, Send, Trash2, X } from "lucide-react";
import type { Devis } from "@prisma/client";
import { formatJour, xof } from "@/lib/format";
import { BoutonEnvoi, FormAction, Formulaire } from "@/components/formulaire";
import { LignesDevis } from "@/components/lignes-devis";
import { Tiroir } from "@/components/tiroir";
import { Badge, Champ, type Ton } from "@/components/ui";
import { deciderDevis, envoyerDevis, nouveauDevis, supprimerDevis } from "@/server/devis-actions";

const STATUT: Record<Devis["statut"], { label: string; ton: Ton }> = {
  EMIS: { label: "En attente de réponse", ton: "edu" },
  ACCEPTE: { label: "Accepté", ton: "vert" },
  REFUSE: { label: "Refusé", ton: "gris" },
};

export function PanneauDevis({
  dossierId,
  devis,
  procedure,
  emailClient,
  peutAgir,
}: {
  dossierId: string;
  devis: Devis[];
  procedure: { nom: string; tarifXof: number };
  emailClient: string | null;
  peutAgir: boolean;
}) {
  return (
    <article className="carte" id="devis">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold"><FileSignature size={18} className="text-ink/40" /> Devis</h2>
        {peutAgir ? (
          <Tiroir label="Nouveau devis" variante="second" icone={<FilePlus2 size={16} />} titre="Nouveau devis" description="Le devis est numéroté, généré en PDF et peut partir par e-mail au client.">
            <Formulaire action={nouveauDevis} submit="Établir le devis" succes="Devis établi" className="grid gap-4">
              <input type="hidden" name="dossierId" value={dossierId} />
              <Champ label="Objet">
                <input className="champ" name="objet" defaultValue={`Accompagnement ${procedure.nom}`} required />
              </Champ>
              <LignesDevis initiales={[{ libelle: `Frais de service – ${procedure.nom}`, quantite: 1, prix: procedure.tarifXof }]} />
              <Champ label="Validité (jours)">
                <input className="champ" name="validite" inputMode="numeric" defaultValue="30" />
              </Champ>
              <Champ label="Conditions" aide="Modalités de paiement, prestations exclues…">
                <textarea className="champ" name="conditions" rows={3} defaultValue="Acompte de 50 % à la signature du contrat, solde avant le dépôt du dossier." />
              </Champ>
              <label className="flex items-center gap-2 text-sm text-ink/70">
                <input type="checkbox" name="envoyer" defaultChecked={Boolean(emailClient)} className="h-4 w-4 accent-desk" />
                Envoyer aussitôt au client {emailClient ? `(${emailClient})` : "(aucune adresse e-mail sur la fiche)"}
              </label>
            </Formulaire>
          </Tiroir>
        ) : null}
      </div>
      {devis.length === 0 ? (
        <p className="rounded-xl bg-paper px-4 py-3 text-sm text-ink/50">Aucun devis pour ce dossier.</p>
      ) : (
        <ul className="grid gap-2">
          {devis.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink/[0.07] px-4 py-3">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                  {item.numero} <Badge ton={STATUT[item.statut].ton}>{STATUT[item.statut].label}</Badge>
                </p>
                <p className="truncate text-xs text-ink/50">
                  {item.objet} · {formatJour(item.creeLe)}
                  {item.envoyeLe ? ` · envoyé le ${formatJour(item.envoyeLe)}` : ""}
                  {item.validiteLe && item.statut === "EMIS" ? ` · valable jusqu'au ${formatJour(item.validiteLe)}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-1 font-bold tabular-nums">{xof(item.total)}</span>
                <a href={`/api/pdf/devis/${item.id}`} target="_blank" rel="noreferrer" className="bouton-fantome px-2 text-desk" title="Voir le PDF">
                  <FileDown size={15} />
                </a>
                {peutAgir ? (
                  <Tiroir label="Envoyer" variante="second" icone={<Mail size={15} />} titre={`Envoyer le devis ${item.numero}`} description="Le devis part en PDF, en pièce jointe, avec un SMS de prévenance.">
                    <Formulaire action={envoyerDevis} submit="Envoyer" succes="Devis envoyé" icone={<Send size={15} />}>
                      <input type="hidden" name="devisId" value={item.id} />
                      <Champ label="Adresse du destinataire">
                        <input className="champ" type="email" name="email" defaultValue={emailClient ?? ""} required />
                      </Champ>
                    </Formulaire>
                  </Tiroir>
                ) : null}
                {peutAgir && item.statut === "EMIS" ? (
                  <>
                    <FormAction action={deciderDevis.bind(null, item.id, "ACCEPTE")} succes="Devis accepté, montant convenu mis à jour">
                      <BoutonEnvoi className="bouton-fantome px-2 text-vert" titre="Accepté par le client">
                        <Check size={15} />
                      </BoutonEnvoi>
                    </FormAction>
                    <FormAction action={deciderDevis.bind(null, item.id, "REFUSE")} succes="Devis marqué refusé">
                      <BoutonEnvoi className="bouton-fantome px-2 text-ink/50" titre="Refusé par le client">
                        <X size={15} />
                      </BoutonEnvoi>
                    </FormAction>
                    <FormAction action={supprimerDevis.bind(null, item.id)} succes="Devis supprimé" confirmer={`Supprimer le devis ${item.numero} ?`}>
                      <BoutonEnvoi className="bouton-fantome px-2 text-ink/35 hover:text-cap" titre="Supprimer">
                        <Trash2 size={15} />
                      </BoutonEnvoi>
                    </FormAction>
                  </>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
