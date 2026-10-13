"use client";

import { useRef, useState, useTransition } from "react";
import { Loader2, Upload } from "lucide-react";
import { useReveil } from "@/components/formulaire";
import { useToast } from "@/components/toasts";
import { deposerPiece } from "@/server/actions";

const TAILLE_MAX = 10 * 1024 * 1024;

export function JoindreScan({ pieceId, libelle }: { pieceId: string; libelle: string }) {
  const toast = useToast();
  const reveiller = useReveil();
  const champ = useRef<HTMLInputElement>(null);
  const [envoi, setEnvoi] = useState(false);
  const [, demarrer] = useTransition();

  const envoyer = (fichier: File) => {
    if (fichier.size > TAILLE_MAX) {
      toast(`${fichier.name} dépasse 10 Mo. Compressez-le ou scannez en qualité standard.`, "erreur");
      return;
    }
    setEnvoi(true);
    const data = new FormData();
    data.set("pieceId", pieceId);
    data.set("fichier", fichier);
    demarrer(async () => {
      try {
        const resultat = await deposerPiece(null, data);
        toast(resultat?.error ?? `${libelle} : copie numérique ajoutée`, resultat?.error ? "erreur" : "succes");
      } catch {
        toast("L'envoi n'a pas abouti. Réessayez.", "erreur");
      } finally {
        setEnvoi(false);
        reveiller();
      }
    });
  };

  return (
    <>
      <input
        ref={champ}
        type="file"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        accept="image/*,application/pdf,.doc,.docx"
        onChange={(evenement) => {
          const fichier = evenement.target.files?.[0];
          evenement.target.value = "";
          if (fichier) envoyer(fichier);
        }}
      />
      <button
        type="button"
        className="bouton-fantome shrink-0 px-2 text-desk"
        disabled={envoi}
        onClick={() => champ.current?.click()}
        title={`Joindre le scan de ${libelle}`}
        aria-label={`Joindre le scan de ${libelle}`}
      >
        {envoi ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
      </button>
    </>
  );
}
