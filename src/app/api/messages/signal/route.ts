import { NextResponse } from "next/server";
import { getUser } from "@/server/session";
import { diffuser } from "@/server/temps-reel";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await getUser();
  if (!user || user.role === "PARTENAIRE") return new NextResponse(null, { status: 401 });
  const corps = (await request.json().catch(() => null)) as { aId?: unknown } | null;
  const aId = typeof corps?.aId === "string" ? corps.aId : "";
  if (!/^[a-z0-9]{10,40}$/.test(aId) || aId === user.id) return new NextResponse(null, { status: 400 });
  diffuser(aId, { type: "ecrit", par: user.id });
  return new NextResponse(null, { status: 204 });
}
