"use client";

import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { AlertTriangle, Loader2 } from "lucide-react";
import type { EtatAction } from "@/server/actions";
import { useToast } from "@/components/toasts";
import { useFermerTiroir } from "@/components/tiroir";

// Après une action serveur, React garde parfois le rafraîchissement de la page en attente
// jusqu'à la prochaine mise à jour d'état : quelques mises à jour anodines le débloquent aussitôt.
// Elles sont diffusées à tous les composants montés, car le formulaire d'origine peut avoir
// disparu entre-temps (tiroir refermé après l'enregistrement).
const abonnes = new Set<() => void>();

export function useReveil() {
  const [, setTic] = useState(0);
  useEffect(() => {
    const tic = () => setTic((n) => n + 1);
    abonnes.add(tic);
    return () => {
      abonnes.delete(tic);
    };
  }, []);
  return useCallback(() => {
    for (const delai of [0, 60, 200, 500, 1000]) setTimeout(() => abonnes.forEach((tic) => tic()), delai);
  }, []);
}

export function Formulaire({
  action,
  children,
  submit,
  succes = "Enregistré avec succès",
  reinitialiser = true,
  className = "grid gap-3",
  boutonClassName = "bouton",
  icone,
}: {
  action: (etat: EtatAction, data: FormData) => Promise<EtatAction>;
  children: React.ReactNode;
  submit: string;
  succes?: string;
  reinitialiser?: boolean;
  className?: string;
  boutonClassName?: string;
  icone?: React.ReactNode;
}) {
  const formulaire = useRef<HTMLFormElement>(null);
  const toast = useToast();
  const fermer = useFermerTiroir();
  const reveiller = useReveil();

  const [etat, formAction, pending] = useActionState(async (precedent: EtatAction, data: FormData) => {
    const resultat = await action(precedent, data);
    if (!resultat?.error) {
      toast(succes);
      if (reinitialiser) formulaire.current?.reset();
      fermer?.();
    }
    reveiller();
    return resultat;
  }, null);

  return (
    <form ref={formulaire} action={formAction} className={className}>
      {children}
      {etat?.error ? (
        <div className="flex animate-secousse gap-2.5 rounded-xl border border-cap/15 bg-red-50/80 px-3.5 py-3 text-sm text-cap">
          <AlertTriangle size={18} className="mt-px shrink-0" />
          <div>
            <p className="font-semibold">{etat.error}</p>
            {etat.manques?.length ? (
              <ul className="mt-1 list-disc pl-4 text-cap/90">
                {etat.manques.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      ) : null}
      <button className={boutonClassName} disabled={pending}>
        {pending ? <Loader2 size={16} className="animate-spin" /> : icone}
        {pending ? "Enregistrement…" : submit}
      </button>
    </form>
  );
}

export function FormAction({
  action,
  children,
  succes,
  confirmer,
  className,
}: {
  action: (data: FormData) => Promise<void>;
  children: React.ReactNode;
  succes?: string;
  confirmer?: string;
  className?: string;
}) {
  const toast = useToast();
  const reveiller = useReveil();
  return (
    <form
      className={className}
      action={async (data) => {
        if (confirmer && !window.confirm(confirmer)) return;
        try {
          await action(data);
          if (succes) toast(succes);
        } catch (erreur) {
          const digest = (erreur as { digest?: unknown } | null)?.digest;
          if (typeof digest === "string" && digest.startsWith("NEXT_")) throw erreur;
          toast("L'action n'a pas abouti. Réessayez dans un instant.", "erreur");
        } finally {
          reveiller();
        }
      }}
    >
      {children}
    </form>
  );
}

export function BoutonEnvoi({ children, className = "bouton-second", titre }: { children: React.ReactNode; className?: string; titre?: string }) {
  const { pending } = useFormStatus();
  return (
    <button className={className} disabled={pending} title={titre}>
      {pending ? <Loader2 size={15} className="animate-spin" /> : null}
      {children}
    </button>
  );
}
