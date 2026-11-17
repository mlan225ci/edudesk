"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Archive, ArchiveRestore, MoreHorizontal, Trash2 } from "lucide-react";
import { archiverClient, restaurerClient, supprimerClient } from "@/server/actions";

type Etape = "menu" | "archiver" | "supprimer";

export function MenuClient({ clientId, nom, archive, suppression }: { clientId: string; nom: string; archive: boolean; suppression: boolean }) {
  const [ouvert, setOuvert] = useState(false);
  const [etape, setEtape] = useState<Etape>("menu");
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const bouton = useRef<HTMLButtonElement>(null);
  const panneau = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ouvert) return;
    const fermer = (event: MouseEvent) => {
      const cible = event.target as Node;
      if (bouton.current?.contains(cible) || panneau.current?.contains(cible)) return;
      setOuvert(false);
    };
    const touche = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOuvert(false);
    };
    const surScroll = () => setOuvert(false);
    document.addEventListener("mousedown", fermer);
    document.addEventListener("keydown", touche);
    window.addEventListener("scroll", surScroll, true);
    return () => {
      document.removeEventListener("mousedown", fermer);
      document.removeEventListener("keydown", touche);
      window.removeEventListener("scroll", surScroll, true);
    };
  }, [ouvert]);

  useLayoutEffect(() => {
    if (!ouvert || !bouton.current || !panneau.current) return;
    const rect = bouton.current.getBoundingClientRect();
    const pan = panneau.current.getBoundingClientRect();
    const marge = 8;
    let left = rect.right - pan.width;
    left = Math.max(marge, Math.min(left, window.innerWidth - pan.width - marge));
    let top = rect.bottom + 6;
    if (top + pan.height > window.innerHeight - marge) top = Math.max(marge, rect.top - pan.height - 6);
    setCoords({ top, left });
  }, [ouvert, etape]);

  function ouvrir() {
    setEtape("menu");
    setCoords(null);
    setOuvert((etat) => !etat);
  }

  const libelle = archive ? "Restaurer" : "Archiver";
  const action = etape === "supprimer" ? supprimerClient : archive ? restaurerClient : archiverClient;

  return (
    <>
      <button
        ref={bouton}
        type="button"
        className="bouton-fantome relative z-20 px-2"
        aria-label={`Actions pour ${nom}`}
        aria-expanded={ouvert}
        aria-haspopup="menu"
        onClick={ouvrir}
      >
        <MoreHorizontal size={16} />
      </button>
      {ouvert
        ? createPortal(
            <div
              ref={panneau}
              role="menu"
              className="fixed z-[80] w-60 rounded-2xl border border-ink/10 bg-white p-1.5 shadow-[0_18px_50px_-28px_rgba(20,40,75,0.6)]"
              style={{ top: coords?.top ?? -9999, left: coords?.left ?? -9999 }}
            >
              {etape === "menu" ? (
                <>
                  <button type="button" role="menuitem" className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-medium text-ink hover:bg-paper" onClick={() => setEtape("archiver")}>
                    {archive ? <ArchiveRestore size={15} className="text-ink/45" /> : <Archive size={15} className="text-ink/45" />}
                    {libelle}
                  </button>
                  {suppression ? (
                    <button type="button" role="menuitem" className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-medium text-cap hover:bg-red-50" onClick={() => setEtape("supprimer")}>
                      <Trash2 size={15} /> Supprimer
                    </button>
                  ) : null}
                </>
              ) : (
                <form action={action} className="grid gap-2 px-2.5 py-2">
                  <input type="hidden" name="clientId" value={clientId} />
                  <p className="text-sm leading-5 text-ink/70">
                    {etape === "supprimer"
                      ? `Effacer ${nom}, ses dossiers, ses factures et ses paiements. Cette action est irréversible.`
                      : archive
                        ? `Restaurer ${nom} dans la liste des clients.`
                        : `Retirer ${nom} de la liste. Les dossiers et les paiements restent.`}
                  </p>
                  <div className="flex justify-end gap-1.5">
                    <button type="button" className="bouton-fantome" onClick={() => setEtape("menu")}>Annuler</button>
                    <button type="submit" className={etape === "supprimer" ? "rounded-lg bg-cap px-3 py-1.5 text-sm font-semibold text-white hover:bg-cap/90" : "rounded-lg bg-desk px-3 py-1.5 text-sm font-semibold text-white hover:bg-desk/90"}>
                      {etape === "supprimer" ? "Supprimer" : libelle}
                    </button>
                  </div>
                </form>
              )}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
