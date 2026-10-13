import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUser } from "@/server/session";

const TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".txt": "text/plain; charset=utf-8",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user || user.role === "PARTENAIRE") {
    return new NextResponse("Non autorise", { status: 401 });
  }
  const { id } = await context.params;
  const piece = await prisma.pieceDossier.findUnique({ where: { id }, include: { dossier: { include: { client: true } } } });
  if (!piece?.fichierChemin) return new NextResponse("Introuvable", { status: 404 });
  const chemin = path.join(process.cwd(), "storage", "pieces", path.basename(piece.fichierChemin));
  let contenu: Buffer;
  try {
    contenu = await readFile(chemin);
  } catch {
    return new NextResponse("Fichier absent du stockage", { status: 404 });
  }
  const extension = path.extname(piece.fichierNom ?? piece.fichierChemin).toLowerCase();
  const nom = `${piece.libelle} - ${piece.dossier.client.prenom} ${piece.dossier.client.nom}${extension}`;
  const telecharger = new URL(request.url).searchParams.has("telecharger");
  await prisma.audit.create({
    data: { userId: user.id, action: "PIECE_CONSULTEE", entite: "Dossier", entiteId: piece.dossierId, detail: piece.libelle },
  });
  return new NextResponse(new Uint8Array(contenu), {
    headers: {
      "Content-Type": TYPES[extension] ?? "application/octet-stream",
      "Content-Disposition": `${telecharger ? "attachment" : "inline"}; filename="${nom
        .normalize("NFD")
        .replace(/[^\x20-\x7e]/g, "")
        .replace(/["\\]/g, "")}"; filename*=UTF-8''${encodeURIComponent(nom)}`,
      "Cache-Control": "private, max-age=300",
    },
  });
}
