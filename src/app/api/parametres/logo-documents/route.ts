import { NextResponse } from "next/server";
import { logoDocuments } from "@/server/parametres";
import { getUser } from "@/server/session";

export async function GET() {
  const user = await getUser();
  if (!user || user.role === "PARTENAIRE") return new NextResponse("Non autorise", { status: 401 });
  const logo = await logoDocuments();
  if (!logo) return new NextResponse("Aucun logo", { status: 404 });
  return new NextResponse(new Uint8Array(logo.octets), {
    headers: { "Content-Type": logo.type === "jpg" ? "image/jpeg" : "image/png", "Cache-Control": "private, no-store" },
  });
}
