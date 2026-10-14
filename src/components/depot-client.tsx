"use client";

import { useActionState, useRef } from "react";
import { Loader2, Upload } from "lucide-react";
import { deposerPieceClient, type EtatDepot } from "@/server/suivi";

export function DepotClient({ pieceId, libelle, remplacer = false }: { pieceId: string; libelle: string; remplacer?: boolean }) {
  const formulaire = useRef<HTMLFormElement>(null);
  const [etat, action, envoi] = useActionState<EtatDepot, FormData>(deposerPieceClient, null);
  return (
    <form ref={formulaire} action={action} className="grid justify-items-end gap-1">
      <input type="hidden" name="pieceId" value={pieceId} />
      <label className={`${remplacer ? "bouton-fantome text-xs" : "bouton py-1.5 text-xs"} cursor-pointer ${envoi ? "pointer-events-none opacity-60" : ""}`}>
        {envoi ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
        {envoi ? "Envoi…" : remplacer ? "Remplacer" : "Déposer"}
        <input
          type="file"
          name="fichier"
          className="sr-only"
          accept="application/pdf,image/jpeg,image/png,image/webp"
          aria-label={`Déposer ${libelle}`}
          onChange={(event) => {
            if (event.target.files?.length) formulaire.current?.requestSubmit();
          }}
        />
      </label>
      {etat?.error ? <p className="max-w-56 text-right text-xs text-cap">{etat.error}</p> : null}
    </form>
  );
}
