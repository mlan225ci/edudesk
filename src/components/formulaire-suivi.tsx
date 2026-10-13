"use client";

import { useActionState } from "react";
import { AlertTriangle, ArrowRight, KeyRound, Loader2 } from "lucide-react";
import { consulterSuivi } from "@/server/suivi";

export function FormulaireSuivi() {
  const [etat, action, pending] = useActionState(consulterSuivi, null);

  return (
    <form action={action} className="grid gap-5">
      <label className="etiquette">
        <span>Code de suivi</span>
        <span className="relative">
          <KeyRound size={17} className="absolute top-1/2 left-3.5 -translate-y-1/2 text-ink/35" />
          <input
            className="champ h-14 pl-11 font-mono text-xl font-bold tracking-[0.25em] uppercase placeholder:font-sans placeholder:text-base placeholder:font-normal placeholder:tracking-normal"
            name="code"
            key={etat?.saisie}
            defaultValue={etat?.saisie}
            placeholder="Ex. K7MP-4XRT"
            autoComplete="one-time-code"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={12}
            required
            autoFocus
          />
        </span>
      </label>
      {etat?.error ? (
        <p className="flex animate-entree items-center gap-2 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-cap">
          <AlertTriangle size={16} className="shrink-0" /> {etat.error}
        </p>
      ) : null}
      <button className="bouton h-12 text-base" disabled={pending}>
        {pending ? <Loader2 size={18} className="animate-spin" /> : null}
        {pending ? "Recherche…" : "Voir mon dossier"}
        {pending ? null : <ArrowRight size={18} />}
      </button>
    </form>
  );
}
