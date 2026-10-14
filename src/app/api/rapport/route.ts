import { NextResponse } from "next/server";
import { voitRapports } from "@/server/permissions";
import { pdfRapport } from "@/server/rapport-pdf";
import { getUser } from "@/server/session";
import { lirePeriode } from "@/server/statistiques";

export async function GET(request: Request) {
  const user = await getUser();
  if (!user || !voitRapports(user.role)) return new NextResponse("Non autorise", { status: 401 });
  const parametres = new URL(request.url).searchParams;
  const periode = lirePeriode(parametres.get("periode") ?? undefined, parametres.get("cle") ?? undefined);
  const fichier = await pdfRapport(periode);
  return new NextResponse(new Uint8Array(fichier.octets), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${fichier.nom}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
