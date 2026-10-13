"use client";

import { useEffect, useRef, useState } from "react";

export type FormatCompteur = "xof" | "nombre" | "pourcent";

function formater(valeur: number, format: FormatCompteur) {
  const texte = new Intl.NumberFormat("fr-FR").format(Math.round(valeur));
  if (format === "xof") return `${texte} F CFA`;
  if (format === "pourcent") return `${texte} %`;
  return texte;
}

export function Compteur({ valeur, format = "nombre" }: { valeur: number; format?: FormatCompteur }) {
  const [affiche, setAffiche] = useState(0);
  const depart = useRef(0);

  useEffect(() => {
    const initial = depart.current;
    const duree = 700;
    const debut = performance.now();
    let image = 0;
    const etape = (maintenant: number) => {
      const t = Math.min((maintenant - debut) / duree, 1);
      const adouci = 1 - Math.pow(1 - t, 3);
      setAffiche(initial + (valeur - initial) * adouci);
      if (t < 1) image = requestAnimationFrame(etape);
      else depart.current = valeur;
    };
    image = requestAnimationFrame(etape);
    return () => cancelAnimationFrame(image);
  }, [valeur]);

  return <span className="tabular-nums">{formater(affiche, format)}</span>;
}
