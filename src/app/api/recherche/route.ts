import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { nomComplet } from "@/lib/format";
import { peutProspects } from "@/server/permissions";
import { getUser } from "@/server/session";

export async function GET(request: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Non autorise" }, { status: 401 });
  const terme = (new URL(request.url).searchParams.get("q") ?? "").trim();
  if (terme.length < 2) return NextResponse.json({ clients: [], dossiers: [], prospects: [] });

  const mots = terme.split(/\s+/).filter(Boolean);
  const correspondPersonne = (mot: string) => [
    { nom: { contains: mot, mode: "insensitive" as const } },
    { prenom: { contains: mot, mode: "insensitive" as const } },
    { telephone: { contains: mot.replace(/\s/g, "") } },
  ];
  const portee: Prisma.ClientWhereInput = user.role === "PARTENAIRE" ? { partenaireId: user.partenaireId ?? "__aucun__" } : {};

  const [clients, dossiers, prospects] = await Promise.all([
    prisma.client.findMany({
      where: { ...portee, AND: mots.map((mot) => ({ OR: correspondPersonne(mot) })) },
      take: 5,
      orderBy: { creeLe: "desc" },
    }),
    prisma.dossier.findMany({
      where: {
        client: portee,
        AND: mots.map((mot) => ({
          OR: [
            { reference: { contains: mot, mode: "insensitive" as const } },
            { client: { OR: correspondPersonne(mot) } },
            { procedure: { destination: { contains: mot, mode: "insensitive" as const } } },
          ],
        })),
      },
      include: { client: true, procedure: true },
      take: 6,
      orderBy: { ouvertLe: "desc" },
    }),
    peutProspects(user.role)
      ? prisma.prospect.findMany({
          where: { converti: false, AND: mots.map((mot) => ({ OR: correspondPersonne(mot) })) },
          take: 4,
          orderBy: { creeLe: "desc" },
        })
      : [],
  ]);

  return NextResponse.json({
    clients: clients.map((client) => ({ id: client.id, nom: nomComplet(client), telephone: client.telephone })),
    dossiers: dossiers.map((dossier) => ({
      id: dossier.id,
      reference: dossier.reference,
      client: nomComplet(dossier.client),
      destination: dossier.procedure.destination,
    })),
    prospects: prospects.map((prospect) => ({ id: prospect.id, nom: nomComplet(prospect), telephone: prospect.telephone })),
  });
}
