"use client";

import { useEffect, useId, useRef, useState } from "react";
import { FolderOpen, Loader2, Search, X } from "lucide-react";
import type { DossierFacturable } from "@/server/dossiers-facturables";
import { LignesDevis } from "@/components/lignes-devis";

const MESSAGE_REQUIS = "Choisissez le client dans la liste des résultats.";

function objetPropose(dossier: DossierFacturable) {
  return `Accompagnement ${dossier.procedure}`;
}

function lignePropose(dossier: DossierFacturable) {
  return { libelle: `Frais de service – ${dossier.procedure}`, quantite: 1, prix: dossier.tarif };
}

export function ChoixDossier({ initial, onChoix }: { initial: DossierFacturable | null; onChoix?: (dossier: DossierFacturable | null) => void }) {
  const [choisi, setChoisi] = useState(initial);
  const [requete, setRequete] = useState("");
  const [resultats, setResultats] = useState<DossierFacturable[]>([]);
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState(false);
  const [ouvert, setOuvert] = useState(false);
  const [actif, setActif] = useState(0);
  const champ = useRef<HTMLInputElement>(null);
  const liste = useId();

  useEffect(() => {
    champ.current?.setCustomValidity(choisi ? "" : MESSAGE_REQUIS);
  }, [choisi]);

  useEffect(() => {
    if (!ouvert) return;
    setChargement(true);
    const controleur = new AbortController();
    const minuteur = setTimeout(async () => {
      try {
        const reponse = await fetch(`/api/facturation/dossiers?q=${encodeURIComponent(requete.trim())}`, { signal: controleur.signal });
        if (!reponse.ok) throw new Error(String(reponse.status));
        setResultats((await reponse.json()).dossiers);
        setErreur(false);
        setActif(0);
      } catch {
        if (controleur.signal.aborted) return;
        setResultats([]);
        setErreur(true);
      } finally {
        if (!controleur.signal.aborted) setChargement(false);
      }
    }, 200);
    return () => {
      clearTimeout(minuteur);
      controleur.abort();
    };
  }, [requete, ouvert]);

  const choisir = (dossier: DossierFacturable | null) => {
    setChoisi(dossier);
    setRequete("");
    setOuvert(false);
    onChoix?.(dossier);
    if (!dossier) setTimeout(() => champ.current?.focus(), 0);
  };

  return (
    <div className="etiquette">
      <span>Client</span>
      <input type="hidden" name="dossierId" value={choisi?.id ?? ""} />
      {choisi ? (
        <div className="flex items-center gap-3 rounded-xl border border-desk/25 bg-desk/[0.04] px-3 py-2.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-desk text-white">
            <FolderOpen size={17} />
          </span>
          <span className="min-w-0 flex-1 font-normal">
            <span className="block truncate font-semibold text-ink">{choisi.client}</span>
            <span className="block truncate text-xs text-ink/55">
              {choisi.reference} · {choisi.procedure} · {choisi.telephone}
            </span>
          </span>
          <button type="button" className="bouton-fantome px-2 text-xs" onClick={() => choisir(null)}>
            <X size={14} /> Changer
          </button>
        </div>
      ) : (
        <div className="relative">
          {chargement ? (
            <Loader2 size={16} className="absolute top-1/2 left-3.5 -translate-y-1/2 animate-spin text-desk" />
          ) : (
            <Search size={16} className="absolute top-1/2 left-3.5 -translate-y-1/2 text-ink/35" />
          )}
          <input
            ref={champ}
            className="champ pl-10"
            role="combobox"
            aria-expanded={ouvert}
            aria-controls={liste}
            aria-autocomplete="list"
            autoComplete="off"
            required
            value={requete}
            placeholder="Nom, téléphone, e-mail ou référence du dossier…"
            onChange={(event) => {
              setRequete(event.target.value);
              setOuvert(true);
            }}
            onFocus={() => setOuvert(true)}
            onBlur={() => setTimeout(() => setOuvert(false), 150)}
            onInvalid={() => setOuvert(true)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setOuvert(true);
                setActif((index) => Math.min(index + 1, resultats.length - 1));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setActif((index) => Math.max(index - 1, 0));
              } else if (event.key === "Enter") {
                event.preventDefault();
                if (ouvert && resultats[actif]) choisir(resultats[actif]);
              } else if (event.key === "Escape" && ouvert) {
                event.stopPropagation();
                setOuvert(false);
              }
            }}
          />
          {ouvert ? (
            <ul id={liste} role="listbox" className="absolute inset-x-0 top-full z-20 mt-1.5 max-h-72 overflow-y-auto rounded-xl border border-ink/[0.08] bg-white p-1.5 font-normal shadow-xl">
              {!requete.trim() && resultats.length ? <li className="px-3 pt-1.5 pb-1 text-[11px] font-semibold tracking-wider text-ink/40 uppercase">Dossiers récents</li> : null}
              {resultats.map((dossier, index) => (
                <li key={dossier.id} role="option" aria-selected={index === actif}>
                  <button
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setActif(index)}
                    onClick={() => choisir(dossier)}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition ${index === actif ? "bg-desk/[0.07]" : ""}`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-ink">{dossier.client}</span>
                      <span className="block truncate text-xs text-ink/50">
                        {dossier.reference} · {dossier.procedure} · {dossier.telephone}
                      </span>
                    </span>
                    <span className="shrink-0 text-[11px] text-ink/40">{dossier.statut}</span>
                  </button>
                </li>
              ))}
              {!chargement && resultats.length === 0 ? (
                <li className="px-3 py-5 text-center text-sm text-ink/50">
                  {erreur
                    ? "La recherche n'a pas abouti. Réessayez dans un instant."
                    : requete.trim()
                      ? `Aucun client ne correspond à « ${requete.trim()} ».`
                      : "Aucun dossier pour l'instant."}
                </li>
              ) : null}
            </ul>
          ) : null}
        </div>
      )}
    </div>
  );
}

export function EnteteDocument({ initial, placeholderObjet }: { initial: DossierFacturable | null; placeholderObjet: string }) {
  const [objet, setObjet] = useState(initial ? objetPropose(initial) : "");
  const [objetAuto, setObjetAuto] = useState(objet);
  const [proposition, setProposition] = useState(initial ? lignePropose(initial) : null);

  const choisir = (dossier: DossierFacturable | null) => {
    if (!dossier) return;
    const suggere = objetPropose(dossier);
    if (!objet.trim() || objet === objetAuto) setObjet(suggere);
    setObjetAuto(suggere);
    setProposition(lignePropose(dossier));
  };

  return (
    <>
      <ChoixDossier initial={initial} onChoix={choisir} />
      <label className="etiquette">
        <span>Objet</span>
        <input className="champ" name="objet" placeholder={placeholderObjet} value={objet} onChange={(event) => setObjet(event.target.value)} required />
      </label>
      <LignesDevis initiales={proposition ? [proposition] : []} proposition={proposition} />
    </>
  );
}
