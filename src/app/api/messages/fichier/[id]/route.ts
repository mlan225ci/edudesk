import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUser } from "@/server/session";
import { REPERTOIRE_MESSAGES, TYPES_MESSAGES } from "@/server/fichiers-messages";

export const runtime = "nodejs";

const AFFICHABLES = /^(image\/|audio\/|application\/pdf|text\/plain)/;

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user || user.role === "PARTENAIRE") return new NextResponse("Non autorise", { status: 401 });
  const { id } = await context.params;
  const message = await prisma.message.findUnique({ where: { id } });
  if (!message?.fichierChemin || (message.deId !== user.id && message.aId !== user.id)) {
    return new NextResponse("Introuvable", { status: 404 });
  }
  let contenu: Buffer;
  try {
    contenu = await readFile(path.join(REPERTOIRE_MESSAGES, path.basename(message.fichierChemin)));
  } catch {
    return new NextResponse("Fichier absent du stockage", { status: 404 });
  }
  const type = TYPES_MESSAGES[path.extname(message.fichierChemin).toLowerCase()] ?? "application/octet-stream";
  const nom = message.fichierNom ?? "fichier";
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
