"use client";

import { useTransition, type DragEvent } from "react";
import Link from "next/link";
import { deplacerProspect } from "@/server/actions";
import { ETAPES_PIPELINE } from "@/lib/labels";

export type CarteProspect = {
  id: string;
  nom: string;
  telephone: string;
  source: string;
  etape: string;
};

export function KanbanProspects({ cartes }: { cartes: CarteProspect[] }) {
  const [enCours, demarrer] = useTransition();

  function deposer(etape: string, event: DragEvent) {
    event.preventDefault();
    const id = event.dataTransfer.getData("text/plain");
    if (!id) return;
    const data = new FormData();
    data.set("prospectId", id);
    data.set("etape", etape);
    demarrer(() => {
      void deplacerProspect(data);
    });
  }

  return (
    <div className={`grid gap-3 overflow-x-auto pb-2 lg:grid-cols-5 ${enCours ? "opacity-70" : ""}`}>
      {ETAPES_PIPELINE.map((colonne) => {
        const lignes = cartes.filter((carte) => carte.etape === colonne.value);
        return (
          <section
            key={colonne.value}
            className="carte grid min-w-[220px] content-start gap-2 bg-paper/60 p-3"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => deposer(colonne.value, event)}
          >
            <header className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">{colonne.label}</h2>
              <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-ink/50">{lignes.length}</span>
            </header>
            {lignes.map((carte) => (
              <article
                key={carte.id}
                draggable
                onDragStart={(event) => event.dataTransfer.setData("text/plain", carte.id)}
                className="cursor-grab rounded-xl border border-ink/[0.06] bg-white p-3 shadow-sm active:cursor-grabbing"
              >
                <Link href={`/prospects/${carte.id}`} className="block font-semibold hover:text-desk">
                  {carte.nom}
                </Link>
                <p className="mt-0.5 text-xs text-ink/50">{carte.telephone}</p>
                <p className="text-xs text-ink/45">{carte.source}</p>
                <label className="mt-2 block text-[11px] font-semibold text-ink/40">
                  Déplacer
                  <select
                    className="champ mt-1 py-1 text-xs"
                    value={carte.etape}
                    onChange={(event) => {
                      const data = new FormData();
                      data.set("prospectId", carte.id);
                      data.set("etape", event.target.value);
                      demarrer(() => {
                        void deplacerProspect(data);
                      });
                    }}
                  >
                    {ETAPES_PIPELINE.map((etape) => (
                      <option key={etape.value} value={etape.value}>
                        {etape.label}
                      </option>
                    ))}
                  </select>
                </label>
              </article>
            ))}
          </section>
        );
      })}
    </div>
  );
}
