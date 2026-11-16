"use client";

import { useActionState } from "react";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { annulerCode, confirmerCode, renvoyerCode, type EtatAction } from "@/server/actions";

export function CodeConnexion({ email }: { email: string }) {
  const [etat, confirmer, enCours] = useActionState(confirmerCode, null);
  const [renvoi, renvoyer, renvoiEnCours] = useActionState(renvoyerCode as (etat: EtatAction, data: FormData) => Promise<EtatAction>, null);

  return (
    <div className="grid gap-5">
      <form action={confirmer} className="grid gap-5">
        <label className="etiquette">
          <span>Code reçu sur {email}</span>
          <input
            className="champ text-center text-2xl tracking-[0.45em]"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            pattern="[0-9]{6}"
            maxLength={6}
            placeholder="000000"
            required
          />
        </label>
        {etat?.error ? (
          <p className="flex animate-entree items-center gap-2 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-cap">
            <AlertTriangle size={16} /> {etat.error}
          </p>
        ) : null}
        <button className="bouton h-12 text-base" disabled={enCours}>
          {enCours ? <Loader2 size={18} className="animate-spin" /> : null}
          {enCours ? "Vérification…" : "Valider"}
        </button>
      </form>
      <form action={renvoyer} className="grid gap-3">
        {renvoi?.error ? (
          <p className="flex items-center gap-2 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-cap">
            <AlertTriangle size={16} /> {renvoi.error}
          </p>
        ) : null}
        {renvoi?.info ? (
          <p className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-800">
            <CheckCircle2 size={16} /> {renvoi.info}
          </p>
        ) : null}
        <button className="bouton-second h-11" disabled={renvoiEnCours}>
          {renvoiEnCours ? <Loader2 size={16} className="animate-spin" /> : null}
          Renvoyer le code
        </button>
      </form>
      <form action={annulerCode}>
        <button className="bouton-fantome w-full">Utiliser un autre compte</button>
      </form>
    </div>
  );
}
