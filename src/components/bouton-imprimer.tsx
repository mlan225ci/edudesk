"use client";

import { Printer } from "lucide-react";

export function BoutonImprimer() {
  return (
    <button type="button" className="bouton" onClick={() => window.print()}>
      <Printer size={16} /> Imprimer / PDF
    </button>
  );
}
