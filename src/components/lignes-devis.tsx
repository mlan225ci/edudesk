"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { xof } from "@/lib/format";

type Ligne = { cle: number; libelle: string; quantite: string; prix: string };

function nombre(valeur: string) {
  return Number(valeur.replace(/[\s\u00a0\u202f]/g, "")) || 0;
}

export function LignesDevis({ initiales }: { initiales: { libelle: string; quantite: number; prix: number }[] }) {
  const [lignes, setLignes] = useState<Ligne[]>(() =>
    (initiales.length ? initiales : [{ libelle: "", quantite: 1, prix: 0 }]).map((ligne, index) => ({
      cle: index,
      libelle: ligne.libelle,
      quantite: String(ligne.quantite),
      prix: ligne.prix ? String(ligne.prix) : "",
    })),
  );
  const modifier = (cle: number, champ: keyof Omit<Ligne, "cle">, valeur: string) =>
    setLignes((avant) => avant.map((ligne) => (ligne.cle === cle ? { ...ligne, [champ]: valeur } : ligne)));
  const total = lignes.reduce((somme, ligne) => somme + nombre(ligne.quantite) * nombre(ligne.prix), 0);

  return (
    <div className="grid gap-2">
      <div className="grid grid-cols-[1fr_3.5rem_7rem_2rem] gap-2 text-xs font-semibold text-ink/50">
        <span>Prestation</span>
        <span>Qté</span>
        <span>Prix unitaire</span>
        <span />
      </div>
      {lignes.map((ligne) => (
        <div key={ligne.cle} className="grid grid-cols-[1fr_3.5rem_7rem_2rem] items-center gap-2">
          <input className="champ" name="libelle" value={ligne.libelle} onChange={(event) => modifier(ligne.cle, "libelle", event.target.value)} placeholder="Frais de dossier…" required />
          <input className="champ px-2 text-center" name="quantite" inputMode="numeric" value={ligne.quantite} onChange={(event) => modifier(ligne.cle, "quantite", event.target.value)} />
          <input className="champ" name="prix" inputMode="numeric" value={ligne.prix} onChange={(event) => modifier(ligne.cle, "prix", event.target.value)} placeholder="0" />
          <button
            type="button"
            className="bouton-fantome px-1.5 text-ink/40 hover:text-cap"
            disabled={lignes.length === 1}
            onClick={() => setLignes((avant) => avant.filter((item) => item.cle !== ligne.cle))}
            aria-label="Retirer la ligne"
          >
            <Trash2 size={15} />
          </button>
        </div>
      ))}
      <div className="flex items-center justify-between gap-3 pt-1">
        <button
          type="button"
          className="bouton-fantome -ml-2.5 text-desk"
          onClick={() => setLignes((avant) => [...avant, { cle: Math.max(...avant.map((ligne) => ligne.cle)) + 1, libelle: "", quantite: "1", prix: "" }])}
        >
          <Plus size={15} /> Ajouter une ligne
        </button>
        <p className="text-sm">
          Total <span className="ml-1 text-lg font-bold tabular-nums">{xof(total)}</span>
        </p>
      </div>
    </div>
  );
}
