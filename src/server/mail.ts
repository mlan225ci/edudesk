import { randomBytes } from "node:crypto";
import nodemailer from "nodemailer";
import { prisma } from "../lib/db";
import { configMail, lireEntreprise, logoDocuments, type Entreprise } from "./parametres";
import type { FichierPdf } from "./pdf";
import { pieceJointe } from "./pdf-commercial";

function echapper(texte: string) {
  return texte.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function blocCode(code: string) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 22px"><tr><td align="center" style="background:#14284b;border-radius:14px;padding:26px 12px">
<div style="font-size:12px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:#f2b705">Votre code</div>
<div style="margin-top:12px;font-size:42px;line-height:1;font-weight:800;letter-spacing:12px;color:#ffffff">${echapper(code)}</div>
</td></tr></table>`;
}

function enrichir(texte: string, code?: string) {
  return texte
    .split(/\n{2,}/)
    .map((paragraphe) => {
      if (code && paragraphe.trim() === code) return blocCode(code);
      return `<p style="margin:0 0 14px">${echapper(paragraphe)
        .replace(/\n/g, "<br>")
        .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#14284b;font-weight:600">$1</a>')}</p>`;
    })
    .join("");
}

function apercu(corps: string) {
  const ligne = corps.replace(/\s+/g, " ").trim();
  return echapper(ligne.slice(0, 140));
}

export function habillerMail(sujet: string, corps: string, entreprise: Entreprise, avecLogo = false, code?: string) {
  const coordonnees = [entreprise.adresse, entreprise.telephone, entreprise.email, entreprise.siteWeb].filter(Boolean).map(echapper).join(" · ");
  const entete = avecLogo
    ? `<tr><td style="padding:22px 28px 18px;background:#ffffff">
<img src="cid:logo-edudesk" alt="${echapper(entreprise.nom)}" width="156" style="display:block;border:0;outline:none;height:auto;max-width:156px">
<div style="font-size:13px;font-weight:700;margin-top:12px">${echapper(entreprise.nom)}</div>
${entreprise.slogan ? `<div style="font-size:12px;color:#7a8296;margin-top:2px">${echapper(entreprise.slogan)}</div>` : ""}
</td></tr>`
    : `<tr><td style="background:#14284b;padding:22px 28px;color:#ffffff">
<div style="font-size:20px;font-weight:700;letter-spacing:.3px">${echapper(entreprise.nom)}</div>
<div style="font-size:12px;color:#c9d1e3;margin-top:4px">${echapper(entreprise.slogan || "")}</div>
</td></tr>`;
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${echapper(sujet)}</title></head><body style="margin:0;background:#f6f5f1;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#14284b">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${apercu(corps)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f5f1;padding:28px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;background:#ffffff;border-radius:16px;overflow:hidden">
${entete}
<tr><td style="height:4px;background:#f2b705"></td></tr>
<tr><td style="padding:28px;font-size:15px;line-height:1.6">
<h1 style="font-size:18px;margin:0 0 18px">${echapper(sujet)}</h1>
${enrichir(corps, code)}
</td></tr>
<tr><td style="padding:16px 28px;border-top:1px solid #eceae4;font-size:11px;line-height:1.5;color:#7a8296">${echapper(entreprise.nom)}${coordonnees ? ` · ${coordonnees}` : ""}<br>Message lié au suivi de votre dossier.</td></tr>
</table></td></tr></table></body></html>`;
}

function domaine(adresse: string) {
  return adresse.split("@")[1]?.toLowerCase() ?? "";
}

export type ResultatMail = { statut: "ENVOYE" | "JOURNAL"; id?: string };

export async function envoyerMailDirect(input: { a: string; sujet: string; corps: string; pieces?: FichierPdf[]; code?: string }): Promise<ResultatMail> {
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
  const logo = await logoDocuments();
  const boite = config.utilisateur && emailValide(config.utilisateur) ? config.utilisateur.trim() : null;
  const adresseVisible = boite && domaine(boite) !== domaine(config.expediteur) ? boite : config.expediteur;
  const signature = [entreprise.nom, entreprise.telephone, entreprise.email].filter(Boolean).join(" · ");
  const texte = input.corps.includes(entreprise.nom) ? input.corps : `${input.corps}\n\n— ${signature}`;
  const info = await transport.sendMail({
    from: { name: config.nomExpediteur, address: adresseVisible },
    replyTo: config.expediteur,
    envelope: { from: boite ?? config.expediteur, to: input.a },
    to: input.a,
    subject: input.sujet,
    text: texte,
    html: habillerMail(input.sujet, input.corps, entreprise, Boolean(logo), input.code),
    messageId: `<${randomBytes(16).toString("hex")}@${domaine(adresseVisible) || "localhost"}>`,
    attachments: [
      ...(logo
        ? [
            {
              filename: logo.type === "jpg" ? "logo.jpg" : "logo.png",
              content: logo.octets,
              cid: "logo-edudesk",
              contentType: logo.type === "jpg" ? "image/jpeg" : "image/png",
              contentDisposition: "inline" as const,
            },
          ]
        : []),
      ...(input.pieces?.map((piece) => ({ filename: piece.nom, content: piece.octets, contentType: "application/pdf" })) ?? []),
    ],
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
