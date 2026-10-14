import nodemailer from "nodemailer";
import { prisma } from "../lib/db";
import { configMail, lireEntreprise, type Entreprise } from "./parametres";
import type { FichierPdf } from "./pdf";
import { pieceJointe } from "./pdf-commercial";

function echapper(texte: string) {
  return texte.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function enrichir(texte: string) {
  return echapper(texte)
    .split(/\n{2,}/)
    .map((paragraphe) =>
      `<p style="margin:0 0 14px">${paragraphe
        .replace(/\n/g, "<br>")
        .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#14284b;font-weight:600">$1</a>')}</p>`,
    )
    .join("");
}

export function habillerMail(sujet: string, corps: string, entreprise: Entreprise) {
  const coordonnees = [entreprise.adresse, entreprise.telephone, entreprise.email, entreprise.siteWeb].filter(Boolean).map(echapper).join(" · ");
  return `<!doctype html><html lang="fr"><body style="margin:0;background:#f6f5f1;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#14284b">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f5f1;padding:28px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;background:#ffffff;border-radius:16px;overflow:hidden">
<tr><td style="background:#14284b;padding:22px 28px;color:#ffffff">
<div style="font-size:20px;font-weight:700;letter-spacing:.3px">${echapper(entreprise.nom)}</div>
<div style="font-size:12px;color:#c9d1e3;margin-top:4px">${echapper(entreprise.slogan || "")}</div>
</td></tr>
<tr><td style="height:4px;background:#f2b705"></td></tr>
<tr><td style="padding:28px;font-size:15px;line-height:1.6">
<h1 style="font-size:18px;margin:0 0 18px">${echapper(sujet)}</h1>
${enrichir(corps)}
</td></tr>
<tr><td style="padding:16px 28px;border-top:1px solid #eceae4;font-size:11px;color:#7a8296">${echapper(entreprise.nom)}${coordonnees ? ` · ${coordonnees}` : ""}</td></tr>
</table></td></tr></table></body></html>`;
}

export type ResultatMail = { statut: "ENVOYE" | "JOURNAL"; id?: string };

export async function envoyerMailDirect(input: { a: string; sujet: string; corps: string; pieces?: FichierPdf[] }): Promise<ResultatMail> {
  const config = await configMail();
  if (!config.hote || !config.expediteur) {
    console.log(`[E-mail journal] ${input.a}: ${input.sujet}`);
    return { statut: "JOURNAL" };
  }
  const transport = nodemailer.createTransport({
    host: config.hote,
    port: config.port,
    secure: config.securise,
    auth: config.utilisateur ? { user: config.utilisateur, pass: config.motDePasse ?? "" } : undefined,
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 30000,
  });
  const entreprise = await lireEntreprise();
  const info = await transport.sendMail({
    from: { name: config.nomExpediteur, address: config.expediteur },
    to: input.a,
    subject: input.sujet,
    text: input.corps,
    html: habillerMail(input.sujet, input.corps, entreprise),
    attachments: input.pieces?.map((piece) => ({ filename: piece.nom, content: piece.octets, contentType: "application/pdf" })),
  });
  return { statut: "ENVOYE", id: info.messageId };
}

export async function expedierMail(id: string) {
  const row = await prisma.notificationMail.findUnique({ where: { id } });
  if (!row || row.statut !== "EN_ATTENTE") return;
  try {
    const piece = await pieceJointe(row.pieceJointe);
    const resultat = await envoyerMailDirect({ a: row.destinataire, sujet: row.sujet, corps: row.corps, pieces: piece ? [piece] : [] });
    await prisma.notificationMail.update({ where: { id }, data: { statut: resultat.statut, envoyeLe: new Date(), erreur: null } });
  } catch (error) {
    await prisma.notificationMail.update({
      where: { id },
      data: { statut: "ECHEC", erreur: (error instanceof Error ? error.message : "Echec e-mail").slice(0, 500) },
    });
  }
}

export function emailValide(valeur: string | null | undefined) {
  return !!valeur && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valeur.trim());
}
