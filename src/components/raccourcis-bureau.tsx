"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  RACCOURCIS,
  RACCOURCIS_DEFAUT,
  dansChampSaisie,
  ecrireRaccourcis,
  labelCombinaison,
  lireRaccourcis,
  reinitialiserRaccourcis,
  trouverRaccourci,
  type Combinaison,
  type RaccourciId,
} from "@/lib/raccourcis";

type ActionsLocales = {
  recherche?: () => void;
  nouveau?: () => void;
};

type ContexteRaccourcis = {
  carte: Record<RaccourciId, Combinaison | null>;
  label: (id: RaccourciId) => string;
  enregistrerAction: (action: keyof ActionsLocales, fn: (() => void) | undefined) => void;
  definir: (id: RaccourciId, combo: Combinaison | null) => void;
  reinitialiser: () => void;
};

const RaccourcisCtx = createContext<ContexteRaccourcis | null>(null);

export function RaccourcisBureau({ accueil, children }: { accueil: string; children: React.ReactNode }) {
  const router = useRouter();
  const [carte, setCarte] = useState<Record<RaccourciId, Combinaison | null>>(RACCOURCIS_DEFAUT);
  const [pret, setPret] = useState(false);
  const [actions, setActions] = useState<ActionsLocales>({});

  useEffect(() => {
    setCarte(lireRaccourcis());
    setPret(true);
  }, []);

  const enregistrerAction = useCallback((action: keyof ActionsLocales, fn: (() => void) | undefined) => {
    setActions((actuel) => {
      if (actuel[action] === fn) return actuel;
      return { ...actuel, [action]: fn };
    });
  }, []);

  const definir = useCallback((id: RaccourciId, combo: Combinaison | null) => {
    setCarte((actuel) => {
      const suivant = { ...actuel, [id]: combo };
      ecrireRaccourcis(suivant);
      return suivant;
    });
  }, []);

  const reinitialiser = useCallback(() => {
    const defaut = reinitialiserRaccourcis();
    setCarte(defaut);
  }, []);

  useEffect(() => {
    if (!pret) return;
    const surTouche = (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (dansChampSaisie(event.target) && !(event.ctrlKey || event.metaKey || event.altKey)) return;
      const def = trouverRaccourci(carte, event);
      if (!def) return;
      event.preventDefault();
      if (def.action === "recherche") {
        actions.recherche?.();
        return;
      }
      if (def.action === "nouveau") {
        actions.nouveau?.();
        return;
      }
      const href = def.href === "__accueil__" ? accueil : def.href;
      if (href) {
        window.dispatchEvent(new Event("edudesk:navigation"));
        router.push(href);
      }
    };
    document.addEventListener("keydown", surTouche);
    return () => document.removeEventListener("keydown", surTouche);
  }, [accueil, actions, carte, pret, router]);

  const valeur = useMemo<ContexteRaccourcis>(
    () => ({
      carte,
      label: (id) => labelCombinaison(carte[id]),
      enregistrerAction,
      definir,
      reinitialiser,
    }),
    [carte, definir, enregistrerAction, reinitialiser],
  );

  return <RaccourcisCtx.Provider value={valeur}>{children}</RaccourcisCtx.Provider>;
}

export function useRaccourcis() {
  const ctx = useContext(RaccourcisCtx);
  if (!ctx) throw new Error("useRaccourcis hors RaccourcisBureau");
  return ctx;
}

export function useRaccourciAction(action: keyof ActionsLocales, fn: () => void) {
  const ctx = useContext(RaccourcisCtx);
  useEffect(() => {
    if (!ctx) return;
    ctx.enregistrerAction(action, fn);
    return () => ctx.enregistrerAction(action, undefined);
  }, [action, ctx, fn]);
}

export function groupesRaccourcis() {
  return [...new Set(RACCOURCIS.map((item) => item.groupe))];
}
