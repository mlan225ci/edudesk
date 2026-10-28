import { randomBytes } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db";

/** Renvoie l'identifiant du message cité s'il appartient bien à la conversation, sinon null. */
export async function verifierReponse(reponseAId: unknown, moiId: string, autreId: string) {
  const id = typeof reponseAId === "string" ? reponseAId.trim() : "";
  if (!id) return null;
  const origine = await prisma.message.findFirst({
    where: {
      id,
      OR: [
        { deId: moiId, aId: autreId },
        { deId: autreId, aId: moiId },
      ],
    },
    select: { id: true },
  });
  return origine?.id ?? null;
}

export const REPERTOIRE_MESSAGES = path.join(process.cwd(), "storage", "messages");
export const TAILLE_MAX_MESSAGE = 10 * 1024 * 1024;

export const TYPES_MESSAGES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".odt": "application/vnd.oasis.opendocument.text",
  ".ods": "application/vnd.oasis.opendocument.spreadsheet",
  ".txt": "text/plain; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".zip": "application/zip",
  ".webm": "audio/webm",
  ".ogg": "audio/ogg",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".wav": "audio/wav",
};

export const EXTENSIONS_AUDIO = new Set([".webm", ".ogg", ".mp3", ".m4a", ".wav"]);

export type FichierMessagePret = {
  fichier: File;
  nom: string;
  extension: string;
  type: string;
  duree: number | null;
};

/** Valide le fichier d'un message (direct ou groupe) : taille, extension, durée d'un audio. */
export function controlerFichierMessage(fichier: unknown, dureeBrute: unknown): { error: string } | FichierMessagePret {
  if (!(fichier instanceof File) || fichier.size === 0) return { error: "Choisissez un fichier." };
  if (fichier.size > TAILLE_MAX_MESSAGE) return { error: "Le fichier dépasse 10 Mo." };
  const nom = fichier.name.slice(0, 160) || "fichier";
  const extension = path.extname(nom).toLowerCase();
  const type = TYPES_MESSAGES[extension];
  if (!type) return { error: "Format non accepté. Envoyez un PDF, une image, un document Office, un texte, un ZIP ou un audio." };
  const dureeNombre = Number(dureeBrute);
  const duree = EXTENSIONS_AUDIO.has(extension) && Number.isFinite(dureeNombre) && dureeNombre >= 0 ? Math.min(Math.round(dureeNombre), 3600) : null;
  return { fichier, nom, extension, type, duree };
}

export async function compterFichiersRecents(userId: string) {
  const depuis = new Date(Date.now() - 10 * 60_000);
  const [directs, groupes] = await Promise.all([
    prisma.message.count({ where: { deId: userId, fichierChemin: { not: null }, creeLe: { gte: depuis } } }),
    prisma.messageGroupe.count({ where: { deId: userId, fichierChemin: { not: null }, creeLe: { gte: depuis } } }),
  ]);
  return directs + groupes;
}

export async function stockerFichierMessage(fichier: File, extension: string) {
  await mkdir(REPERTOIRE_MESSAGES, { recursive: true });
  const chemin = `${Date.now()}-${randomBytes(8).toString("hex")}${extension}`;
  await writeFile(path.join(REPERTOIRE_MESSAGES, chemin), Buffer.from(await fichier.arrayBuffer()));
  return chemin;
}

export async function retirerFichierMessage(chemin: string) {
  await unlink(path.join(REPERTOIRE_MESSAGES, path.basename(chemin))).catch(() => undefined);
}
