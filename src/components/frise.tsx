"use client";

import { useEffect, useRef } from "react";
import { Check, PenLine } from "lucide-react";

type EtapeFrise = { id: string; numero: string; titre: string; statut: "A_VENIR" | "EN_COURS" | "CLOTUREE"; retard: boolean };

export function FriseEtapes({ etapes }: { etapes: EtapeFrise[] }) {
  const conteneur = useRef<HTMLOListElement>(null);

  useEffect(() => {
    const actif = conteneur.current?.querySelector<HTMLElement>("[data-actif='true']");
    if (!actif || !conteneur.current) return;
    const zone = conteneur.current;
    zone.scrollTo({ left: actif.offsetLeft - zone.clientWidth / 2 + actif.clientWidth / 2, behavior: "smooth" });
  }, []);

  return (
    <ol ref={conteneur} className="flex snap-x gap-0 overflow-x-auto pb-2 [scrollbar-width:thin]">
      {etapes.map((etape, index) => {
        const fait = etape.statut === "CLOTUREE";
        const actif = etape.statut === "EN_COURS";
        const contrat = etape.numero === "Contrat";
        return (
          <li key={etape.id} data-actif={actif} className="flex min-w-[132px] flex-1 snap-center flex-col items-center text-center" title={etape.titre}>
            <div className="flex w-full items-center">
              <span className={`h-0.5 flex-1 transition-colors duration-500 ${index === 0 ? "opacity-0" : fait || actif ? "bg-desk" : "bg-ink/10"}`} />
              <span
                className={`relative grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-bold transition duration-300 ${
                  fait ? "bg-desk text-white" : actif ? (etape.retard ? "bg-cap text-white" : "bg-edu text-ink") : "border-2 border-ink/10 bg-white text-ink/35"
                }`}
              >
                {actif ? <span className={`absolute inset-0 animate-ping rounded-full opacity-30 ${etape.retard ? "bg-cap" : "bg-edu"}`} /> : null}
                {fait ? <Check size={17} strokeWidth={3} /> : contrat ? <PenLine size={15} /> : etape.numero}
              </span>
              <span className={`h-0.5 flex-1 transition-colors duration-500 ${index === etapes.length - 1 ? "opacity-0" : fait ? "bg-desk" : "bg-ink/10"}`} />
            </div>
            <p className={`mt-2 line-clamp-2 px-2 text-xs leading-4 ${actif ? "font-bold text-ink" : fait ? "text-ink/60" : "text-ink/40"}`}>
              {contrat ? "Contrat · " : ""}
              {etape.titre}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
