import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUser } from "@/server/session";
import { REPERTOIRE_MESSAGES, TYPES_MESSAGES } from "@/server/fichiers-messages";

export const runtime = "nodejs";

const AFFICHABLES = /^(image\/|audio\/|application\/pdf|text\/plain)/;

function reponseFichier(request: Request, contenu: Buffer, chemin: string, nom: string) {
  const type = TYPES_MESSAGES[path.extname(chemin).toLowerCase()] ?? "application/octet-stream";
  const telecharger = new URL(request.url).searchParams.has("telecharger") || !AFFICHABLES.test(type);
  return new NextResponse(new Uint8Array(contenu), {
    headers: {
      "Content-Type": type,
      "Content-Length": String(contenu.length),
      "Content-Disposition": `${telecharger ? "attachment" : "inline"}; filename="${nom
        .normalize("NFD")
        .replace(/[^\x20-\x7e]/g, "")
        .replace(/["\\]/g, "")}"; filename*=UTF-8''${encodeURIComponent(nom)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=86400",
    },
  });
}

async function servir(request: Request, chemin: string, nom: string) {
  let contenu: Buffer;
  try {
    contenu = await readFile(path.join(REPERTOIRE_MESSAGES, path.basename(chemin)));
  } catch {
    return new NextResponse("Fichier absent du stockage", { status: 404 });
  }
  return reponseFichier(request, contenu, chemin, nom);
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user || user.role === "PARTENAIRE") return new NextResponse("Non autorise", { status: 401 });
  const { id } = await context.params;
  const message = await prisma.message.findUnique({
    where: { id },
    select: { deId: true, aId: true, fichierChemin: true, fichierNom: true },
  });
  if (message?.fichierChemin) {
    if (message.deId !== user.id && message.aId !== user.id) return new NextResponse("Introuvable", { status: 404 });
    return servir(request, message.fichierChemin, message.fichierNom ?? "fichier");
  }
  const groupe = await prisma.messageGroupe.findFirst({
    where: { id, groupe: { membres: { some: { userId: user.id } } } },
    select: { fichierChemin: true, fichierNom: true },
  });
  if (!groupe?.fichierChemin) return new NextResponse("Introuvable", { status: 404 });
  return servir(request, groupe.fichierChemin, groupe.fichierNom ?? "fichier");
}
