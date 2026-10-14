"use server";

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { nomComplet } from "@/lib/format";
import type { EtatAction } from "@/server/actions";
import { peutTraduire } from "@/server/permissions";
import { requireUser } from "@/server/session";

const EXTENSIONS = /\.(pdf|png|jpe?g|webp|docx?|odt)$/i;

export async function demanderTraduction(_etat: EtatAction, formData: FormData): Promise<EtatAction> {
  const user = await requireUser();
  if (user.role === "PARTENAIRE") return { error: "Action réservée aux collaborateurs." };
  const piece = await prisma.pieceDossier.findUnique({
    where: { id: String(formData.get("pieceId") ?? "") },
    include: { dossier: { include: { client: true } } },
  });
  if (!piece) return { error: "Choisissez le document à traduire." };
  const langueSource = String(formData.get("langueSource") ?? "").trim();
  const langueCible = String(formData.get("langueCible") ?? "").trim();
  if (!langueSource || !langueCible || langueSource === langueCible) return { error: "Choisissez deux langues différentes." };
  const echeance = String(formData.get("echeance") ?? "");
  const traducteurId = String(formData.get("traducteurId") ?? "") || null;
  const traducteur = traducteurId
    ? await prisma.user.findFirst({ where: { id: traducteurId, actif: true } })
    : await prisma.user.findFirst({ where: { role: "TRADUCTEUR", actif: true }, orderBy: { prenom: "asc" } });

  const traduction = await prisma.traduction.create({
    data: {
      dossierId: piece.dossierId,
      pieceId: piece.id,
      langueSource,
      langueCible,
      certifiee: formData.get("certifiee") === "on",
      traducteurId: traducteur?.id ?? null,
      echeanceLe: echeance ? new Date(`${echeance}T18:00:00.000Z`) : null,
      observation: String(formData.get("observation") ?? "").trim() || null,
      demandeParId: user.id,
    },
  });
  if (traducteur) {
    await prisma.notificationInterne.create({
      data: {
        userId: traducteur.id,
        titre: "Traduction à faire",
        message: `${piece.libelle} (${langueSource} → ${langueCible}) · ${nomComplet(piece.dossier.client)} · ${piece.dossier.reference}`,
        lien: "/traductions",
      },
    });
  }
  await prisma.audit.create({
    data: {
      userId: user.id,
      action: "TRADUCTION",
      entite: "Dossier",
      entiteId: piece.dossierId,
      detail: `${piece.libelle} : ${langueSource} → ${langueCible}${traduction.certifiee ? " (certifiée)" : ""}`,
    },
  });
  revalidatePath("/", "layout");
  return null;
}

export async function prendreTraduction(id: string) {
  const user = await requireUser();
  if (!peutTraduire(user.role)) return;
  await prisma.traduction.updateMany({ where: { id, statut: "A_FAIRE" }, data: { statut: "EN_COURS", traducteurId: user.id } });
  revalidatePath("/", "layout");
}

export async function livrerTraduction(_etat: EtatAction, formData: FormData): Promise<EtatAction> {
  const user = await requireUser();
  if (!peutTraduire(user.role)) return { error: "Réservé aux traducteurs." };
  const traduction = await prisma.traduction.findUnique({
    where: { id: String(formData.get("traductionId") ?? "") },
    include: { piece: true },
  });
  if (!traduction) return { error: "Traduction introuvable." };
  const fichier = formData.get("fichier");
  if (!(fichier instanceof File) || fichier.size === 0) return { error: "Joignez le fichier traduit." };
  if (fichier.size > 10 * 1024 * 1024) return { error: "Le fichier dépasse 10 Mo." };
  if (!EXTENSIONS.test(fichier.name)) return { error: "Formats acceptés : PDF, image, Word." };
  const dossier = path.join(process.cwd(), "storage", "traductions");
  await mkdir(dossier, { recursive: true });
  const nom = `${traduction.id}-${Date.now()}-${fichier.name.replace(/[^\w.\-]+/g, "_")}`;
  await writeFile(path.join(dossier, nom), Buffer.from(await fichier.arrayBuffer()));
  await prisma.traduction.update({
    where: { id: traduction.id },
    data: {
      statut: "TERMINEE",
      termineLe: new Date(),
      traducteurId: traduction.traducteurId ?? user.id,
      fichierNom: fichier.name,
      fichierChemin: nom,
      observation: String(formData.get("observation") ?? "").trim() || traduction.observation,
    },
  });
  if (traduction.demandeParId !== user.id) {
    await prisma.notificationInterne.create({
      data: {
        userId: traduction.demandeParId,
        titre: "Traduction livrée",
        message: `${traduction.piece.libelle} (${traduction.langueSource} → ${traduction.langueCible}) est traduite.`,
        lien: `/dossiers/${traduction.dossierId}#traductions`,
      },
    });
  }
  await prisma.audit.create({
    data: {
      userId: user.id,
      action: "TRADUCTION",
      entite: "Dossier",
      entiteId: traduction.dossierId,
      detail: `${traduction.piece.libelle} traduite en ${traduction.langueCible}`,
    },
  });
  revalidatePath("/", "layout");
  return null;
}

export async function annulerTraduction(id: string) {
  const user = await requireUser();
  if (user.role === "PARTENAIRE") return;
  const traduction = await prisma.traduction.findUnique({ where: { id }, include: { piece: true } });
  if (!traduction || traduction.statut === "TERMINEE") return;
  await prisma.traduction.delete({ where: { id } });
  await prisma.audit.create({
    data: { userId: user.id, action: "TRADUCTION", entite: "Dossier", entiteId: traduction.dossierId, detail: `Demande annulée : ${traduction.piece.libelle}` },
  });
  revalidatePath("/", "layout");
}
