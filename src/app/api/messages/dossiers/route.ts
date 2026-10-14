import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { nomComplet } from "@/lib/format";
import { STATUTS } from "@/lib/labels";
import { REFERENCE_DOSSIER, type DossierMention } from "@/lib/messages";
import { getUser } from "@/server/session";

export const runtime = "nodejs";

const SUGGESTIONS_MAX = 8;
const REFERENCES_MAX = 50;

const CHAMPS = {
  id: true,
  reference: true,
  statut: true,
  client: { select: { prenom: true, nom: true } },
  procedure: { select: { destination: true } },
} as const;

function versMention(dossier: Prisma.DossierGetPayload<{ select: typeof CHAMPS }>): DossierMention {
  return {
    id: dossier.id,
    reference: dossier.reference,
    client: nomComplet(dossier.client),
    destination: dossier.procedure.destination,
    statut: STATUTS[dossier.statut],
  };
}

export async function GET(request: Request) {
  const user = await getUser();
  if (!user || user.role === "PARTENAIRE") return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  const params = new URL(request.url).searchParams;

  const refs = params.get("refs");
  if (refs !== null) {
    const references = [...new Set(refs.split(","))].filter((reference) => REFERENCE_DOSSIER.test(reference)).slice(0, REFERENCES_MAX);
    if (references.length === 0) return NextResponse.json({ dossiers: [] });
    const dossiers = await prisma.dossier.findMany({ where: { reference: { in: references } }, select: CHAMPS });
    return NextResponse.json({ dossiers: dossiers.map(versMention) });
  }

  const q = (params.get("q") ?? "").trim().slice(0, 60);
  const mots = q.split(/\s+/).filter(Boolean).slice(0, 4);
  const where: Prisma.DossierWhereInput = mots.length
    ? {
        AND: mots.map((mot) => ({
          OR: [
            { reference: { contains: mot, mode: "insensitive" as const } },
            { client: { nom: { contains: mot, mode: "insensitive" as const } } },
            { client: { prenom: { contains: mot, mode: "insensitive" as const } } },
            { procedure: { destination: { contains: mot, mode: "insensitive" as const } } },
          ],
        })),
      }
    : {};
  const dossiers = await prisma.dossier.findMany({ where, orderBy: { ouvertLe: "desc" }, take: SUGGESTIONS_MAX, select: CHAMPS });
  return NextResponse.json({ dossiers: dossiers.map(versMention) });
}
