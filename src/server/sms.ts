import { compterSegments } from "../lib/format";
import { configSms } from "./parametres";

function numeroOperateur(telephone: string) {
  return telephone.replace(/\D/g, "");
}

export async function envoyerSms(telephone: string, texte: string) {
  const config = await configSms();
  if (!config.url) {
    console.log(`[SMS journal] ${telephone}: ${texte}`);
    return { statut: "JOURNAL" as const, fournisseurId: "journal" };
  }

  const smsCloud = /smscloud\.ci/i.test(config.url);
  const response = await fetch(config.url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "Cache-Control": "no-cache",
      ...(config.token ? { Authorization: `Bearer ${config.token}` } : {}),
    },
    body: JSON.stringify(
      smsCloud
        ? { sender: config.expediteur, content: texte, recipients: [numeroOperateur(telephone)], dlrUrl: "" }
        : { to: telephone, text: texte, sender: config.expediteur },
    ),
  });

  const body = (await response.json().catch(() => ({}))) as {
    id?: string;
    failed?: unknown[];
    message?: string;
    error?: string;
  };
  const refus = Array.isArray(body.failed) ? body.failed : [];
  if (!response.ok || refus.length > 0) {
    const detail = body.message || body.error || (refus.length ? "destinataire refusé" : `réponse ${response.status}`);
    throw new Error(String(detail).slice(0, 180));
  }
  return { statut: "ENVOYE" as const, fournisseurId: body.id ?? "http" };
}

export function segmentsDe(texte: string) {
  return compterSegments(texte);
}
