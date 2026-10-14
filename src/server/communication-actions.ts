"use server";

import { unlink } from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import { formatJour, xof } from "@/lib/format";
import type { EtatAction } from "@/server/actions";
import { envoyerPiecesManquantes, refuserDepotClient } from "@/server/engine";
import { emailValide, expedierMail } from "@/server/mail";
import { lireEntreprise } from "@/server/parametres";
import { voitDirection, voitFinance } from "@/server/permissions";
import { requireUser } from "@/server/session";

async function urlDuSite() {
  const entetes = await headers();
  const hote = entetes.get("x-forwarded-host") ?? entetes.get("host");
  if (!hote) return null;
  return `${entetes.get("x-forwarded-proto") ?? (hote.startsWith("localhost") ? "http" : "https")}://${hote}`;
}

export async function renvoyerMail(id: string) {
  const user = await requireUser();
  if (!voitDirection(user.role)) return;
  const mail = await prisma.notificationMail.findUnique({ where: { id } });
  if (!mail || mail.statut === "ENVOYE") return;
  await prisma.notificationMail.update({ where: { id }, data: { statut: "EN_ATTENTE", erreur: null } });
  await expedierMail(id);
  revalidatePath("/", "layout");
}

export async function envoyerFactureParMail(_etat: EtatAction, formData: FormData): Promise<EtatAction> {
  const user = await requireUser();
  if (!voitFinance(user.role)) return { error: "Réservé à la finance et à la direction." };
  const facture = await prisma.facture.findUnique({
    where: { id: String(formData.get("factureId") ?? "") },
    include: { paiement: true, reglements: { select: { montant: true } }, dossier: { include: { client: true, procedure: true } } },
  });
  if (!facture) return { error: "Facture introuvable." };
  if (facture.annuleeLe) return { error: "Cette facture est annulée : elle ne peut plus être envoyée." };
  const destinataire = String(formData.get("email") ?? "").trim() || facture.dossier.client.email;
  if (!emailValide(destinataire)) return { error: "Indiquez une adresse e-mail valide." };
  const entreprise = await lireEntreprise();
  const regle = facture.paiement ? facture.montant : facture.reglements.reduce((somme, reglement) => somme + reglement.montant, 0);
  const reste = Math.max(facture.montant - regle, 0);
  const situation = facture.paiement
    ? `acquittée le ${formatJour(facture.paiement.dateEncaissement)}`
    : reste === 0
      ? "entièrement réglée"
      : `dont il reste ${xof(reste)} à régler${facture.echeanceLe ? ` avant le ${formatJour(facture.echeanceLe)}` : ""}`;
  const ligne = await prisma.notificationMail.create({
    data: {
      destinataire: destinataire!.trim(),
      type: "CLIENT",
      dossierId: facture.dossierId,
      sujet: `Facture ${facture.numero} – ${entreprise.nom}`,
      corps: `Bonjour ${facture.dossier.client.prenom},\n\nVeuillez trouver ci-joint la facture ${facture.numero} d'un montant de ${xof(facture.montant)}, ${situation}, pour votre dossier ${facture.dossier.procedure.destination} (${facture.dossier.reference}).\n\nCordialement,\nL'équipe ${entreprise.nom}`,
      pieceJointe: `facture:${facture.id}`,
    },
  });
  await expedierMail(ligne.id);
  await prisma.facture.update({ where: { id: facture.id }, data: { envoyeeLe: new Date() } });
  await prisma.audit.create({
    data: { userId: user.id, action: "FACTURE_ENVOYEE", entite: "Dossier", entiteId: facture.dossierId, detail: `${facture.numero} → ${destinataire}` },
  });
  revalidatePath("/", "layout");
  const envoi = await prisma.notificationMail.findUnique({ where: { id: ligne.id } });
  if (envoi?.statut === "ECHEC") return { error: `Le serveur a refusé l'envoi : ${envoi.erreur ?? "erreur inconnue"}.` };
  if (envoi?.statut === "JOURNAL") return { error: "Aucun serveur e-mail branché (Paramètres › E-mail) : l'envoi a seulement été journalisé." };
  return null;
}

export async function validerDepot(pieceId: string) {
  const user = await requireUser();
  if (user.role === "PARTENAIRE") return;
  const piece = await prisma.pieceDossier.findUnique({ where: { id: pieceId } });
  if (!piece || piece.recue || !piece.fichierChemin) return;
  await prisma.pieceDossier.update({ where: { id: piece.id }, data: { recue: true, recueLe: new Date(), recueParId: user.id } });
  await prisma.audit.create({ data: { userId: user.id, action: "PIECE_RECUE", entite: "Dossier", entiteId: piece.dossierId, detail: `${piece.libelle} (dépôt client validé)` } });
  revalidatePath("/", "layout");
}

export async function refuserDepot(pieceId: string) {
  const user = await requireUser();
  if (user.role === "PARTENAIRE") return;
  const chemin = await refuserDepotClient({ pieceId, actor: user });
  if (chemin) await unlink(path.join(process.cwd(), "storage", "pieces", path.basename(chemin))).catch(() => undefined);
  revalidatePath("/", "layout");
}

export async function relancerPieces(_etat: EtatAction, formData: FormData): Promise<EtatAction> {
  const user = await requireUser();
  if (user.role === "PARTENAIRE") return { error: "Action réservée aux collaborateurs." };
  const resultat = await envoyerPiecesManquantes({
    dossierId: String(formData.get("dossierId") ?? ""),
    actor: user,
    baseUrl: await urlDuSite(),
  });
  if (!resultat.ok) return { error: resultat.error };
  revalidatePath("/", "layout");
  return null;
}
