import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { normaliserCodeSuivi } from "@/lib/suivi";
import { pdfFacture } from "@/server/pdf-commercial";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const code = normaliserCodeSuivi((await cookies()).get("edudesk_suivi")?.value ?? "");
  if (!code) return new NextResponse("Session expirée : saisissez à nouveau votre code de suivi.", { status: 401 });
  const { id } = await context.params;
  const facture = await prisma.facture.findFirst({ where: { id, annuleeLe: null, dossier: { codeSuivi: code } }, select: { id: true } });
  if (!facture) return new NextResponse("Facture introuvable.", { status: 404 });
  const fichier = await pdfFacture(facture.id);
  if (!fichier) return new NextResponse("Facture introuvable.", { status: 404 });
  const telecharger = new URL(request.url).searchParams.has("telecharger");
  return new NextResponse(new Uint8Array(fichier.octets), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${telecharger ? "attachment" : "inline"}; filename="${fichier.nom.replace(/[^\w.\-]/g, "_")}"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
