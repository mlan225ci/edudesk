import { NextResponse } from "next/server";
import { pdfDevis, pdfExemple, pdfFacture } from "@/server/pdf-commercial";
import { voitFinance } from "@/server/permissions";
import { getUser } from "@/server/session";

export async function GET(request: Request, context: { params: Promise<{ type: string; id: string }> }) {
  const user = await getUser();
  if (!user || user.role === "PARTENAIRE") return new NextResponse("Non autorise", { status: 401 });
  const { type, id } = await context.params;
  if (type === "facture" && !voitFinance(user.role)) return new NextResponse("Non autorise", { status: 403 });
  const fichier =
    type === "apercu"
      ? id === "devis" || id === "facture"
        ? await pdfExemple(id)
        : null
      : type === "facture"
        ? await pdfFacture(id)
        : type === "devis"
          ? await pdfDevis(id)
          : null;
  if (!fichier) return new NextResponse("Introuvable", { status: 404 });
  const telecharger = new URL(request.url).searchParams.has("telecharger");
  return new NextResponse(new Uint8Array(fichier.octets), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${telecharger ? "attachment" : "inline"}; filename="${fichier.nom.replace(/[^\w.\-]/g, "_")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
