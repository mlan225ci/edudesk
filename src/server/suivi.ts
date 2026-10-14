"use server";

import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { normaliserCodeSuivi } from "@/lib/suivi";

export type EtatSuivi = { error: string; saisie?: string } | null;

const COOKIE = "edudesk_suivi";
const FENETRE = 15 * 60_000;
const ESSAIS_MAX = 8;
const echecs = new Map<string, { nombre: number; depuis: number }>();

async function adresse() {
  const entetes = await headers();
  return entetes.get("x-forwarded-for")?.split(",")[0]?.trim() || entetes.get("x-real-ip") || "local";
}

export async function consulterSuivi(_etat: EtatSuivi, formData: FormData): Promise<EtatSuivi> {
  const ip = await adresse();
  const maintenant = Date.now();
  const compteur = echecs.get(ip);
  if (compteur && maintenant - compteur.depuis < FENETRE && compteur.nombre >= ESSAIS_MAX) {
    return { error: "Trop d'essais. Patientez quelques minutes puis réessayez." };
  }

  const saisie = String(formData.get("code") ?? "").slice(0, 12);
  const code = normaliserCodeSuivi(saisie);
  const dossier = code ? await prisma.dossier.findUnique({ where: { codeSuivi: code }, select: { id: true } }) : null;
  if (!code || !dossier) {
    const actuel = compteur && maintenant - compteur.depuis < FENETRE ? compteur : { nombre: 0, depuis: maintenant };
    echecs.set(ip, { nombre: actuel.nombre + 1, depuis: actuel.depuis });
    return { error: "Code inconnu. Vérifiez le code reçu par SMS, par exemple K7MP-4XRT.", saisie };
  }

  echecs.delete(ip);
  (await cookies()).set(COOKIE, code, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/suivi",
    maxAge: 60 * 60 * 24 * 30,
  });
  redirect("/suivi");
}

export type EtatDepot = { error?: string; ok?: string } | null;

const FORMATS_DEPOT = /\.(pdf|jpe?g|png|webp)$/i;

export async function deposerPieceClient(_etat: EtatDepot, formData: FormData): Promise<EtatDepot> {
  const code = normaliserCodeSuivi((await cookies()).get(COOKIE)?.value ?? "");
  const dossier = code ? await prisma.dossier.findUnique({ where: { codeSuivi: code }, include: { client: true } }) : null;
  if (!dossier) return { error: "Session expirée : saisissez à nouveau votre code de suivi." };
  const piece = await prisma.pieceDossier.findFirst({
    where: { id: String(formData.get("pieceId") ?? ""), dossierId: dossier.id, recue: false },
    include: { etape: true },
  });
  if (!piece || piece.etape?.statut === "A_VENIR") return { error: "Ce document n'est pas attendu pour le moment." };
  const fichier = formData.get("fichier");
  if (!(fichier instanceof File) || fichier.size === 0) return { error: "Choisissez un fichier." };
  if (fichier.size > 10 * 1024 * 1024) return { error: "Le fichier dépasse 10 Mo. Scannez-le en qualité standard." };
  if (!FORMATS_DEPOT.test(fichier.name)) return { error: "Formats acceptés : PDF, JPG, PNG." };
  const recents = await prisma.audit.count({
    where: { entite: "Dossier", entiteId: dossier.id, action: "PIECE_DEPOSEE_CLIENT", creeLe: { gte: new Date(Date.now() - 3600_000) } },
  });
  if (recents >= 30) return { error: "Trop de dépôts en peu de temps. Réessayez plus tard." };

  const repertoire = path.join(process.cwd(), "storage", "pieces");
  await mkdir(repertoire, { recursive: true });
  const nom = `${piece.id}-${Date.now()}-client-${fichier.name.replace(/[^\w.\-]+/g, "_")}`;
  await writeFile(path.join(repertoire, nom), Buffer.from(await fichier.arrayBuffer()));
  if (piece.fichierChemin) await unlink(path.join(repertoire, path.basename(piece.fichierChemin))).catch(() => undefined);
  await prisma.pieceDossier.update({ where: { id: piece.id }, data: { fichierNom: fichier.name, fichierChemin: nom, deposeLe: new Date() } });
  await prisma.audit.create({ data: { action: "PIECE_DEPOSEE_CLIENT", entite: "Dossier", entiteId: dossier.id, detail: piece.libelle } });

  const courante = await prisma.dossierEtape.findFirst({ where: { dossierId: dossier.id, statut: "EN_COURS" }, select: { responsableId: true } });
  const destinataires = new Set<string>();
  if (piece.etape?.responsableId) destinataires.add(piece.etape.responsableId);
  if (courante?.responsableId) destinataires.add(courante.responsableId);
  const assistantes = await prisma.user.findMany({ where: { role: "ASSISTANTE_ADMINISTRATIVE", actif: true }, select: { id: true } });
  assistantes.forEach((user) => destinataires.add(user.id));
  await prisma.notificationInterne.createMany({
    data: [...destinataires].map((userId) => ({
      userId,
      titre: "Pièce déposée par le client",
      message: `${dossier.client.prenom} ${dossier.client.nom} a déposé « ${piece.libelle} » (${dossier.reference}). À vérifier.`,
      lien: `/dossiers/${dossier.id}#documents`,
    })),
  });
  revalidatePath("/suivi");
  revalidatePath(`/dossiers/${dossier.id}`);
  return { ok: piece.libelle };
}

export async function quitterSuivi() {
  (await cookies()).delete({ name: COOKIE, path: "/suivi" });
  redirect("/suivi");
}
