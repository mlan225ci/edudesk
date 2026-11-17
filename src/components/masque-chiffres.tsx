"use client";

import { createContext, useContext, useEffect } from "react";
import { usePathname } from "next/navigation";
import { useToast } from "@/components/toasts";

const Contexte = createContext(false);

export function useMasqueChiffres() {
  return useContext(Contexte);
}

export function MasqueChiffres({ actif, children }: { actif: boolean; children: React.ReactNode }) {
  const toast = useToast();
  const chemin = usePathname() ?? "";

  useEffect(() => {
    if (!actif) return;
    const bloquer = (evenement: Event) => {
      const form = evenement.target;
      if (!(form instanceof HTMLFormElement)) return;
      if (form.dataset.autoriser === "oui" || chemin.startsWith("/parametres")) return;
      const methode = (form.getAttribute("method") || "get").toLowerCase();
      const actionServeur = [...form.elements].some((element) => element instanceof HTMLInputElement && element.name.startsWith("$ACTION"));
      if (methode === "get" && !actionServeur) return;
      evenement.preventDefault();
      evenement.stopPropagation();
      toast("Consultation seule : les modifications et les suppressions sont fermées.", "erreur");
    };
    document.addEventListener("submit", bloquer, true);
    return () => document.removeEventListener("submit", bloquer, true);
  }, [actif, chemin, toast]);

  return <Contexte.Provider value={actif}>{children}</Contexte.Provider>;
}
