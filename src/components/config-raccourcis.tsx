"use client";

import { useEffect, useState } from "react";
import { Keyboard, RotateCcw } from "lucide-react";
import {
  RACCOURCIS,
  combinaisonDepuisEvenement,
  conflitRaccourci,
  labelCombinaison,
  type Combinaison,
  type RaccourciId,
} from "@/lib/raccourcis";
import { groupesRaccourcis, useRaccourcis } from "@/components/raccourcis-bureau";
import { Panneau } from "@/components/graphiques";
import { useToast } from "@/components/toasts";

export function ConfigRaccourcis() {
  const { carte, definir, reinitialiser } = useRaccourcis();
  const toast = useToast();
  const [edition, setEdition] = useState<RaccourciId | null>(null);

  useEffect(() => {
    if (!edition) return;
    const surTouche = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setEdition(null);
        return;
      }
      if (event.key === "Backspace" || event.key === "Delete") {
        event.preventDefault();
        definir(edition, null);
        setEdition(null);
        toast("Raccourci désactivé");
        return;
      }
      const combo = combinaisonDepuisEvenement(event);
      if (!combo || (!combo.ctrl && !combo.alt)) return;
      event.preventDefault();
      event.stopPropagation();
      const conflit = conflitRaccourci(carte, edition, combo);
      if (conflit) {
        toast(`Déjà utilisé par « ${conflit.label} »`);
        return;
      }
      definir(edition, combo);
      setEdition(null);
      toast("Raccourci enregistré");
    };
    document.addEventListener("keydown", surTouche, true);
    return () => document.removeEventListener("keydown", surTouche, true);
  }, [carte, definir, edition, toast]);

  return (
    <Panneau titre="Raccourcis clavier" icone={Keyboard} className="md:col-span-2">
      <p className="mb-4 text-sm text-ink/55">
        Cliquez sur une combinaison, puis appuyez sur les touches souhaitées (avec Ctrl ou Alt). Effacer avec Retour arrière. Échap annule.
      </p>
      <div className="grid gap-5">
        {groupesRaccourcis().map((groupe) => (
          <div key={groupe} className="grid gap-2">
            <p className="text-xs font-semibold tracking-wide text-ink/40 uppercase">{groupe}</p>
            <ul className="grid gap-1.5">
              {RACCOURCIS.filter((item) => item.groupe === groupe).map((item) => (
                <LigneRaccourci
                  key={item.id}
                  label={item.label}
                  description={item.description}
                  combo={carte[item.id]}
                  actif={edition === item.id}
                  onClick={() => setEdition((actuel) => (actuel === item.id ? null : item.id))}
                />
              ))}
            </ul>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="bouton-second mt-5"
        onClick={() => {
          reinitialiser();
          setEdition(null);
          toast("Raccourcis rétablis");
        }}
      >
        <RotateCcw size={15} /> Rétablir les raccourcis par défaut
      </button>
    </Panneau>
  );
}

function LigneRaccourci({
  label,
  description,
  combo,
  actif,
  onClick,
}: {
  label: string;
  description: string;
  combo: Combinaison | null;
  actif: boolean;
  onClick: () => void;
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink/[0.06] bg-paper/60 px-3.5 py-2.5">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-ink">{label}</p>
        <p className="text-xs text-ink/45">{description}</p>
      </div>
      <button
        type="button"
        onClick={onClick}
        className={`rounded-lg border px-2.5 py-1.5 font-mono text-xs font-semibold transition ${
          actif
            ? "border-desk bg-desk/10 text-desk ring-4 ring-desk/10"
            : "border-ink/10 bg-white text-ink/70 hover:border-ink/20"
        }`}
        aria-pressed={actif}
      >
        {actif ? "Appuyez sur les touches…" : labelCombinaison(combo)}
      </button>
    </li>
  );
}
