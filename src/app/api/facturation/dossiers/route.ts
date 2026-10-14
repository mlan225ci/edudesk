import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { CHAMPS_DOSSIER_FACTURABLE, versDossierFacturable } from "@/server/dossiers-facturables";
import { peutDevis } from "@/server/permissions";
import { getUser } from "@/server/session";

export const runtime = "nodejs";

const RESULTATS_MAX = 12;

export async function GET(request: Request) {
  const user = await getUser();
  if (!user || !peutDevis(user.role)) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });

  const q = (new URL(request.url).searchParams.get("q") ?? "").trim().slice(0, 80);
  const chiffres = q.replace(/[\s.+-]/g, "");
  const numero = /^[\d\s.+-]+$/.test(q) && chiffres.length >= 4;
  const mots = numero ? [chiffres] : q.split(/\s+/).filter(Boolean).slice(0, 5);
  const where: Prisma.DossierWhereInput = {
    AND: mots.map((mot) => ({
      OR: [
        { reference: { contains: mot, mode: "insensitive" as const } },
        { client: { nom: { contains: mot, mode: "insensitive" as const } } },
        { client: { prenom: { contains: mot, mode: "insensitive" as const } } },
        { client: { email: { contains: mot, mode: "insensitive" as const } } },
        ...(/\d/.test(mot) ? [{ client: { telephone: { contains: mot.replace(/[\s.-]/g, "") } } }] : []),
        { procedure: { nom: { contains: mot, mode: "insensitive" as const } } },
        { procedure: { destination: { contains: mot, mode: "insensitive" as const } } },
      ],
    })),
  };
  const dossiers = await prisma.dossier.findMany({ where, orderBy: { ouvertLe: "desc" }, take: RESULTATS_MAX, select: CHAMPS_DOSSIER_FACTURABLE });
  return NextResponse.json({ dossiers: dossiers.map(versDossierFacturable) });
}
