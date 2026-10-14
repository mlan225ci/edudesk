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
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".odt": "application/vnd.oasis.opendocument.text",
};

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user || user.role === "PARTENAIRE") return new NextResponse("Non autorise", { status: 401 });
  const { id } = await context.params;
  const traduction = await prisma.traduction.findUnique({ where: { id }, include: { piece: true, dossier: { include: { client: true } } } });
  if (!traduction?.fichierChemin) return new NextResponse("Introuvable", { status: 404 });
  let contenu: Buffer;
  try {
    contenu = await readFile(path.join(process.cwd(), "storage", "traductions", path.basename(traduction.fichierChemin)));
  } catch {
    return new NextResponse("Fichier absent du stockage", { status: 404 });
  }
  const extension = path.extname(traduction.fichierNom ?? traduction.fichierChemin).toLowerCase();
  const nom = `${traduction.piece.libelle} (${traduction.langueCible}) - ${traduction.dossier.client.prenom} ${traduction.dossier.client.nom}${extension}`;
  const telecharger = new URL(request.url).searchParams.has("telecharger");
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
