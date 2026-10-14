import { compterSegments } from "../lib/format";
import { configSms } from "./parametres";

export async function envoyerSms(telephone: string, texte: string) {
  const config = await configSms();
  if (!config.url) {
    console.log(`[SMS journal] ${telephone}: ${texte}`);
    return { statut: "JOURNAL" as const, fournisseurId: "journal" };
  }

  const response = await fetch(config.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(config.token ? { Authorization: `Bearer ${config.token}` } : {}),
    },
    body: JSON.stringify({
      to: telephone,
      text: texte,
      sender: config.expediteur,
    }),
  });

  if (!response.ok) {
    throw new Error(`Operateur SMS ${response.status}`);
  }
  const body = (await response.json().catch(() => ({}))) as { id?: string };
  return { statut: "ENVOYE" as const, fournisseurId: body.id ?? "http" };
}

export function segmentsDe(texte: string) {
  return compterSegments(texte);
}
