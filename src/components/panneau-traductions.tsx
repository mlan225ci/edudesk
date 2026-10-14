import { Download, Eye, Languages, Plus, ShieldCheck, Trash2 } from "lucide-react";
import type { Traduction } from "@prisma/client";
import { formatJour, nomComplet } from "@/lib/format";
import { LANGUES, STATUTS_TRADUCTION } from "@/lib/labels";
import { BoutonEnvoi, FormAction, Formulaire } from "@/components/formulaire";
import { Tiroir } from "@/components/tiroir";
import { Badge, Champ } from "@/components/ui";
import { annulerTraduction, demanderTraduction } from "@/server/traductions-actions";

type TraductionVue = Traduction & { piece: { libelle: string }; traducteur: { prenom: string; nom: string } | null };

export function PanneauTraductions({
  traductions,
  pieces,
  traducteurs,
  peutDemander,
}: {
  traductions: TraductionVue[];
  pieces: { id: string; libelle: string }[];
  traducteurs: { id: string; prenom: string; nom: string }[];
  peutDemander: boolean;
}) {
  return (
    <article className="carte" id="traductions">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold"><Languages size={18} className="text-ink/40" /> Traductions</h2>
        {peutDemander ? (
          <Tiroir label="Demander une traduction" variante="second" icone={<Plus size={16} />} titre="Demander une traduction" description="La traduction reste rattachée au document original du dossier.">
            {pieces.length === 0 ? (
              <p className="rounded-xl bg-paper px-4 py-3 text-sm text-ink/60">Joignez d&apos;abord le fichier du document original dans « Documents du dossier ».</p>
            ) : (
              <Formulaire action={demanderTraduction} submit="Envoyer la demande" succes="Demande transmise au traducteur" className="grid gap-4">
                <Champ label="Document original">
                  <select className="champ" name="pieceId" required>
                    {pieces.map((piece) => (
                      <option key={piece.id} value={piece.id}>{piece.libelle}</option>
                    ))}
                  </select>
                </Champ>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Champ label="De">
                    <select className="champ" name="langueSource" defaultValue="Français">
                      {LANGUES.map((langue) => <option key={langue}>{langue}</option>)}
                    </select>
                  </Champ>
                  <Champ label="Vers">
                    <select className="champ" name="langueCible" defaultValue="Anglais">
                      {LANGUES.map((langue) => <option key={langue}>{langue}</option>)}
                    </select>
                  </Champ>
                </div>
                <label className="flex items-center gap-2 text-sm text-ink/70">
                  <input type="checkbox" name="certifiee" defaultChecked className="h-4 w-4 accent-desk" /> Traduction certifiée (assermentée)
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Champ label="Traducteur">
                    <select className="champ" name="traducteurId" defaultValue="">
                      <option value="">Attribution automatique</option>
                      {traducteurs.map((user) => (
                        <option key={user.id} value={user.id}>{nomComplet(user)}</option>
                      ))}
                    </select>
                  </Champ>
                  <Champ label="Pour le">
                    <input className="champ" type="date" name="echeance" />
                  </Champ>
                </div>
                <Champ label="Consigne">
                  <textarea className="champ" name="observation" rows={2} placeholder="Facultatif" />
                </Champ>
              </Formulaire>
            )}
          </Tiroir>
        ) : null}
      </div>
      {traductions.length === 0 ? (
        <p className="rounded-xl bg-paper px-4 py-3 text-sm text-ink/50">Aucune traduction demandée.</p>
      ) : (
        <ul className="grid gap-2">
          {traductions.map((traduction) => (
            <li key={traduction.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink/[0.07] px-4 py-3">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                  {traduction.piece.libelle}
                  <span className="font-normal text-ink/55">{traduction.langueSource} → {traduction.langueCible}</span>
                  {traduction.certifiee ? <Badge ton="desk"><ShieldCheck size={11} /> Certifiée</Badge> : null}
                  <Badge ton={STATUTS_TRADUCTION[traduction.statut].ton}>{STATUTS_TRADUCTION[traduction.statut].label}</Badge>
                </p>
                <p className="truncate text-xs text-ink/50">
                  {traduction.traducteur ? nomComplet(traduction.traducteur) : "Aucun traducteur attribué"}
                  {traduction.statut === "TERMINEE" ? ` · livrée le ${formatJour(traduction.termineLe)}` : traduction.echeanceLe ? ` · pour le ${formatJour(traduction.echeanceLe)}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <a href={`/api/pieces/${traduction.pieceId}`} target="_blank" rel="noreferrer" className="bouton-fantome px-2 text-xs" title="Voir l'original">
                  <Eye size={14} /> Original
                </a>
                {traduction.fichierChemin ? (
                  <a href={`/api/traductions/${traduction.id}?telecharger=1`} className="bouton-second py-1.5 text-xs">
                    <Download size={14} /> Traduction
                  </a>
                ) : peutDemander ? (
                  <FormAction action={annulerTraduction.bind(null, traduction.id)} succes="Demande annulée" confirmer="Annuler cette demande de traduction ?">
                    <BoutonEnvoi className="bouton-fantome px-2 text-ink/35 hover:text-cap" titre="Annuler la demande">
                      <Trash2 size={15} />
                    </BoutonEnvoi>
                  </FormAction>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
