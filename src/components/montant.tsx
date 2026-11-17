"use client";

import { xof, xofCourt } from "@/lib/format";
import { detailAudit } from "@/lib/labels";
import { useMasqueChiffres } from "@/components/masque-chiffres";

export function Nombre({ valeur }: { valeur: number | string }) {
  const masquer = useMasqueChiffres();
  return <>{masquer ? "••••" : valeur}</>;
}

export function DetailAudit({ detail }: { detail: string }) {
  const masquer = useMasqueChiffres();
  return <>{detailAudit(detail, masquer)}</>;
}

export function Montant({
  valeur,
  court = false,
  avant = "",
  apres = "",
}: {
  valeur: number;
  court?: boolean;
  avant?: string;
  apres?: string;
}) {
  const masquer = useMasqueChiffres();
  const texte = masquer ? "••••" : court ? xofCourt(valeur) : xof(valeur);
  return (
    <>
      {avant}
      {texte}
      {apres}
    </>
  );
}
