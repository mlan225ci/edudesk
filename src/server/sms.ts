import { compterSegments } from "../lib/format";

export async function envoyerSms(telephone: string, texte: string) {
  const url = process.env.SMS_HTTP_URL;
  if (!url) {
    console.log(`[SMS journal] ${telephone}: ${texte}`);
    return { statut: "JOURNAL" as const, fournisseurId: "journal" };
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(process.env.SMS_HTTP_TOKEN ? { Authorization: `Bearer ${process.env.SMS_HTTP_TOKEN}` } : {}),
    },
    body: JSON.stringify({
      to: telephone,
      text: texte,
      sender: process.env.SMS_SENDER || "EDUDESK",
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
