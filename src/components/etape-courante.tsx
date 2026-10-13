"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Check, CheckCircle2, Eye, FileCheck2, FileText, Loader2, Lock, Paperclip, PartyPopper, RotateCcw, Upload, Wallet } from "lucide-react";
import { basculerTache, cloturer, deposerPiece, retirerPiece } from "@/server/actions";
import { Formulaire, useReveil } from "@/components/formulaire";
import { useToast } from "@/components/toasts";
import { estLettreDefinitive } from "@/lib/labels";

export const TAILLE_MAX = 10 * 1024 * 1024;

type TacheVue = { id: string; libelle: string; obligatoire: boolean; faite: boolean };
type PieceVue = { id: string; libelle: string; obligatoire: boolean; recue: boolean; fichier: boolean };
type IssueVue = { id: string; libelle: string; effet: "SUITE" | "RELANCE" | "BOUCLE" };

const EFFETS = {
  SUITE: { texte: "Étape suivante", classe: "bg-vert/10 text-vert" },
  BOUCLE: { texte: "Reprendre l'étape", classe: "bg-edu/20 text-[#8a6500]" },
  RELANCE: { texte: "Relance puis réorientation", classe: "bg-cap/10 text-cap" },
};

export function EtapeCourante({
  etapeId,
  dossierId,
  taches,
  pieces,
  issues,
  attentePaiement,
  peutAgir,
  peutCloturer,
  peutEncaisser,
}: {
  etapeId: string;
  dossierId: string;
  taches: TacheVue[];
  pieces: PieceVue[];
  issues: IssueVue[];
  attentePaiement: string | null;
  peutAgir: boolean;
  peutCloturer: boolean;
  peutEncaisser: boolean;
}) {
  const toast = useToast();
  const reveiller = useReveil();
  const [, demarrer] = useTransition();

  const signatureTaches = taches.map((tache) => `${tache.id}:${tache.faite}`).join("|");
  const signaturePieces = pieces.map((piece) => `${piece.id}:${piece.recue}:${piece.fichier}`).join("|");
  const [faites, setFaites] = useState(() => Object.fromEntries(taches.map((tache) => [tache.id, tache.faite])));
  const [recues, setRecues] = useState(() => Object.fromEntries(pieces.map((piece) => [piece.id, piece.recue])));
  const [enCours, setEnCours] = useState<Record<string, boolean>>({});
  const [vientDeCocher, setVientDeCocher] = useState<string | null>(null);

  useEffect(() => {
    setFaites(Object.fromEntries(taches.map((tache) => [tache.id, tache.faite])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signatureTaches]);
  useEffect(() => {
    setRecues(Object.fromEntries(pieces.map((piece) => [piece.id, piece.recue])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signaturePieces]);

  const occupe = (id: string, valeur: boolean) => setEnCours((etat) => ({ ...etat, [id]: valeur }));

  const verrouillee = (libelle: string) => Boolean(attentePaiement) && estLettreDefinitive(libelle);

  const basculer = (tache: TacheVue) => {
    if (!peutAgir || enCours[tache.id]) return;
    if (!faites[tache.id] && verrouillee(tache.libelle)) {
      toast(`Encaissez d'abord : ${attentePaiement}.`, "erreur");
      return;
    }
    const nouvelle = !faites[tache.id];
    setFaites((etat) => ({ ...etat, [tache.id]: nouvelle }));
    setVientDeCocher(nouvelle ? tache.id : null);
    occupe(tache.id, true);
    const data = new FormData();
    data.set("tacheId", tache.id);
    demarrer(async () => {
      try {
        await basculerTache(data);
      } catch {
        setFaites((etat) => ({ ...etat, [tache.id]: !nouvelle }));
        toast("La tâche n'a pas pu être enregistrée. Réessayez.", "erreur");
      } finally {
        occupe(tache.id, false);
        reveiller();
      }
    });
  };

  const recevoir = (piece: PieceVue, fichier?: File) => {
    if (enCours[piece.id]) return;
    if (fichier && fichier.size > TAILLE_MAX) {
      toast(`${fichier.name} dépasse 10 Mo. Compressez-le ou scannez en qualité standard.`, "erreur");
      return;
    }
    const avant = recues[piece.id];
    setRecues((etat) => ({ ...etat, [piece.id]: true }));
    occupe(piece.id, true);
    const data = new FormData();
    data.set("pieceId", piece.id);
    if (fichier) data.set("fichier", fichier);
    demarrer(async () => {
      try {
        const resultat = await deposerPiece(null, data);
        if (resultat?.error) {
          setRecues((etat) => ({ ...etat, [piece.id]: avant }));
          toast(resultat.error, "erreur");
        } else {
          toast(fichier ? `${piece.libelle} : fichier ajouté` : `${piece.libelle} : marquée reçue`);
        }
      } catch {
        setRecues((etat) => ({ ...etat, [piece.id]: avant }));
        toast("L'envoi n'a pas abouti. Réessayez.", "erreur");
      } finally {
        occupe(piece.id, false);
        reveiller();
      }
    });
  };

  const retirer = (piece: PieceVue) => {
    if (!window.confirm(`Marquer « ${piece.libelle} » comme manquante ?`)) return;
    setRecues((etat) => ({ ...etat, [piece.id]: false }));
    occupe(piece.id, true);
    const data = new FormData();
    data.set("pieceId", piece.id);
    demarrer(async () => {
      try {
        await retirerPiece(data);
      } finally {
        occupe(piece.id, false);
        reveiller();
      }
    });
  };

  const tachesRequises = taches.filter((tache) => tache.obligatoire);
  const piecesRequises = pieces.filter((piece) => piece.obligatoire);
  const total = tachesRequises.length + piecesRequises.length + (attentePaiement ? 1 : 0);
  const prets = tachesRequises.filter((tache) => faites[tache.id]).length + piecesRequises.filter((piece) => recues[piece.id]).length;
  const restants = total - prets;
  const pourcentage = total === 0 ? 100 : Math.round((prets / total) * 100);
  const toutPret = restants === 0;

  return (
    <div className="grid gap-6 px-6 py-5">
      <div className="flex items-center gap-4">
        <div className="relative h-14 w-14 shrink-0">
          <svg viewBox="0 0 36 36" className="h-14 w-14 -rotate-90">
            <circle cx="18" cy="18" r="15.5" fill="none" strokeWidth="3.5" className="stroke-ink/[0.07]" />
            <circle
              cx="18"
              cy="18"
              r="15.5"
              fill="none"
              strokeWidth="3.5"
              strokeLinecap="round"
              pathLength={100}
              strokeDasharray={`${pourcentage} 100`}
              className={`transition-[stroke-dasharray] duration-500 ease-out ${toutPret ? "stroke-vert" : "stroke-desk"}`}
            />
          </svg>
          <span className="absolute inset-0 grid place-items-center text-xs font-bold tabular-nums">{pourcentage}%</span>
        </div>
        <div>
          <p className="font-semibold">
            {toutPret ? "Tout est prêt pour clôturer" : `Encore ${restants} élément${restants > 1 ? "s" : ""} avant de clôturer`}
          </p>
          <p className="text-sm text-ink/55">
            {prets} sur {total} élément{total > 1 ? "s" : ""} obligatoire{total > 1 ? "s" : ""} · cochez au fur et à mesure, tout est enregistré automatiquement.
          </p>
        </div>
      </div>

      {taches.length > 0 ? (
        <section>
          <h3 className="mb-2 text-xs font-semibold tracking-wide text-ink/45 uppercase">Ce qu'il faut faire</h3>
          <ul className="grid gap-1.5">
            {taches.map((tache) => {
              const faite = faites[tache.id];
              return (
                <li key={tache.id}>
                  <button
                    type="button"
                    onClick={() => basculer(tache)}
                    disabled={!peutAgir}
                    aria-pressed={faite}
                    className={`group flex w-full items-center gap-3.5 rounded-xl border px-4 py-3.5 text-left text-sm transition duration-200 active:scale-[0.99] disabled:cursor-default ${
                      faite ? "border-vert/25 bg-vert/[0.06]" : "border-ink/[0.08] bg-white hover:border-desk/35 hover:bg-desk/[0.03] hover:shadow-sm"
                    }`}
                  >
                    <span
                      className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 transition-colors duration-200 ${
                        faite ? "border-vert bg-vert text-white" : "border-ink/20 bg-white group-hover:border-desk/60"
                      } ${faite && vientDeCocher === tache.id ? "animate-coche" : ""}`}
                    >
                      {faite ? <Check size={14} strokeWidth={3.5} /> : null}
                    </span>
                    <span className={`flex-1 transition-colors ${faite ? "text-ink/50" : "font-medium text-ink"}`}>{tache.libelle}</span>
                    {enCours[tache.id] ? <Loader2 size={14} className="animate-spin text-ink/30" /> : null}
                    {!faite && verrouillee(tache.libelle) ? (
                      <span className="flex items-center gap-1 rounded-full bg-edu/20 px-2 py-0.5 text-[11px] font-semibold text-[#8a6500]">
                        <Lock size={11} /> après l'acompte
                      </span>
                    ) : null}
                    {!tache.obligatoire ? <span className="rounded-full bg-ink/5 px-2 py-0.5 text-[11px] font-semibold text-ink/45">facultatif</span> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {pieces.length > 0 ? (
        <section>
          <h3 className="mb-2 text-xs font-semibold tracking-wide text-ink/45 uppercase">Documents à recevoir</h3>
          <ul className="grid gap-1.5">
            {pieces.map((piece) => (
              <LignePiece
                key={piece.id}
                piece={piece}
                recue={recues[piece.id]}
                occupe={Boolean(enCours[piece.id])}
                peutAgir={peutAgir}
                verrou={!recues[piece.id] && verrouillee(piece.libelle)}
                onFichier={(fichier) => recevoir(piece, fichier)}
                onSansFichier={() => recevoir(piece)}
                onRetirer={() => retirer(piece)}
              />
            ))}
          </ul>
        </section>
      ) : null}

      {attentePaiement ? (
        <section className="flex flex-wrap items-center gap-3 rounded-xl border border-edu/40 bg-edu/[0.12] px-4 py-3.5 text-sm">
          <Wallet size={18} className="shrink-0 text-[#8a6500]" />
          <p className="flex-1">
            <span className="font-semibold">Paiement attendu :</span> {attentePaiement}. L'étape se débloque dès l'encaissement.
          </p>
          {peutEncaisser ? (
            <Link href={`/dossiers/${dossierId}?nouveau=encaissement`} scroll={false} className="bouton py-2">
              Encaisser
            </Link>
          ) : null}
        </section>
      ) : null}

      {peutCloturer ? (
        <section className={`rounded-2xl border p-4 transition-colors duration-300 ${toutPret ? "border-vert/30 bg-vert/[0.04]" : "border-ink/[0.08] bg-paper/60"}`}>
          {toutPret || issues.length > 0 ? (
            <div className={toutPret ? "animate-entree" : ""}>
              <p className="mb-3 flex items-center gap-2 text-sm font-semibold">
                {toutPret ? <PartyPopper size={17} className="text-vert" /> : <Lock size={16} className="text-ink/40" />}
                {issues.length > 0 ? "Quelle est l'issue de cette étape ?" : "Clôturer l'étape et lancer la suivante"}
              </p>
              <Formulaire action={cloturer} submit={issues.length > 0 ? "Valider l'issue" : "Clôturer et passer à la suite"} succes="Étape clôturée, la suite est lancée" icone={<CheckCircle2 size={16} />} boutonClassName="bouton w-full sm:w-auto">
                <input type="hidden" name="etapeId" value={etapeId} />
                {issues.length > 0 ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {issues.map((issue) => (
                      <label
                        key={issue.id}
                        className="flex cursor-pointer flex-col gap-1.5 rounded-xl border border-ink/10 bg-white px-4 py-3 text-sm transition hover:border-desk/30 has-checked:border-desk has-checked:bg-desk/[0.05] has-checked:shadow-sm has-focus-visible:ring-2 has-focus-visible:ring-desk/30"
                      >
                        <span className="flex items-center gap-2 font-semibold">
                          <input type="radio" name="issueId" value={issue.id} required className="accent-desk" />
                          {issue.libelle}
                        </span>
                        <span className={`w-fit rounded-full px-2 py-0.5 text-[11px] font-semibold ${EFFETS[issue.effet].classe}`}>{EFFETS[issue.effet].texte}</span>
                      </label>
                    ))}
                  </div>
                ) : null}
                <textarea className="champ" name="observation" rows={2} placeholder="Observation pour la suite (facultatif)…" />
              </Formulaire>
            </div>
          ) : (
            <div className="flex items-center gap-3 text-sm text-ink/60">
              <Lock size={17} className="shrink-0 text-ink/35" />
              Le bouton de clôture apparaîtra dès que les éléments obligatoires seront cochés.
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}

function LignePiece({
  piece,
  recue,
  occupe,
  peutAgir,
  verrou,
  onFichier,
  onSansFichier,
  onRetirer,
}: {
  piece: PieceVue;
  recue: boolean;
  occupe: boolean;
  peutAgir: boolean;
  verrou: boolean;
  onFichier: (fichier: File) => void;
  onSansFichier: () => void;
  onRetirer: () => void;
}) {
  const champ = useRef<HTMLInputElement>(null);
  return (
    <li
      className={`flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 text-sm transition-colors duration-200 ${
        recue ? "border-vert/25 bg-vert/[0.05]" : "border-ink/[0.08] bg-white"
      }`}
    >
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg transition-colors ${recue ? "bg-vert/15 text-vert" : "bg-ink/[0.05] text-ink/40"}`}>
        {occupe ? <Loader2 size={17} className="animate-spin" /> : recue ? <FileCheck2 size={17} /> : <FileText size={17} />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-medium">
          {piece.libelle}
          {!piece.obligatoire ? <span className="ml-2 rounded-full bg-ink/5 px-2 py-0.5 text-[11px] font-semibold text-ink/45">facultatif</span> : null}
        </p>
        <p className={`text-xs ${recue ? "text-vert" : "text-ink/45"}`}>
          {occupe ? "Enregistrement…" : recue ? (piece.fichier ? "Reçue · fichier joint" : "Reçue · sans fichier numérique") : "En attente"}
        </p>
      </div>
      {recue && piece.fichier ? (
        <a href={`/api/pieces/${piece.id}`} target="_blank" rel="noreferrer" className="bouton-fantome text-desk">
          <Eye size={15} /> {piece.libelle} (consulter)
        </a>
      ) : null}
      {peutAgir && verrou ? (
        <span className="flex items-center gap-1 rounded-full bg-edu/20 px-2.5 py-1 text-xs font-semibold text-[#8a6500]">
          <Lock size={12} /> Après l'encaissement de l'acompte
        </span>
      ) : null}
      {peutAgir && !verrou ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <input
            ref={champ}
            type="file"
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            accept="image/*,application/pdf,.doc,.docx"
            onChange={(event) => {
              const fichier = event.target.files?.[0];
              if (fichier) onFichier(fichier);
              event.target.value = "";
            }}
          />
          <button type="button" className={recue ? "bouton-fantome" : "bouton py-2"} disabled={occupe} onClick={() => champ.current?.click()}>
            {recue ? <Paperclip size={14} /> : <Upload size={14} />} {recue ? (piece.fichier ? "Remplacer" : "Joindre le fichier") : "Joindre le fichier"}
          </button>
          {!recue ? (
            <button type="button" className="bouton-second py-2" disabled={occupe} onClick={onSansFichier} title="Le document a été vu en original, sans copie numérique">
              <Check size={14} /> Reçue sans fichier
            </button>
          ) : (
            <button type="button" className="bouton-danger" disabled={occupe} onClick={onRetirer} title="Marquer comme manquante">
              <RotateCcw size={14} />
            </button>
          )}
        </div>
      ) : null}
    </li>
  );
}
