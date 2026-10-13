"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useReveil } from "@/components/formulaire";

export function BarreNavigation() {
  useReveil();
  const pathname = usePathname();
  const recherche = useSearchParams();
  const [actif, setActif] = useState(false);

  useEffect(() => {
    setActif(false);
  }, [pathname, recherche]);

  useEffect(() => {
    const surClic = (evenement: MouseEvent) => {
      if (evenement.button !== 0) return;
      if (evenement.metaKey || evenement.ctrlKey || evenement.shiftKey || evenement.altKey) return;
      const lien = (evenement.target as HTMLElement | null)?.closest("a");
      if (!lien || lien.target === "_blank" || lien.hasAttribute("download")) return;
      const href = lien.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
      const url = new URL(lien.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname.startsWith("/api/")) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      setActif(true);
    };
    const surDebut = () => setActif(true);
    document.addEventListener("click", surClic, true);
    window.addEventListener("edudesk:navigation", surDebut);
    return () => {
      document.removeEventListener("click", surClic, true);
      window.removeEventListener("edudesk:navigation", surDebut);
    };
  }, []);

  useEffect(() => {
    if (!actif) return;
    const securite = window.setTimeout(() => setActif(false), 10000);
    return () => window.clearTimeout(securite);
  }, [actif]);

  return (
    <div
      aria-hidden
      className={`pointer-events-none fixed inset-x-0 top-0 z-[60] h-[3px] overflow-hidden transition-opacity duration-300 ${
        actif ? "opacity-100" : "opacity-0"
      }`}
    >
      <div className="h-full w-1/3 animate-chargement rounded-full bg-gradient-to-r from-edu via-[#ffd75e] to-edu" />
    </div>
  );
}
