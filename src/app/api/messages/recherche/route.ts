import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apercuMessage, correspond, extraitRecherche, type ResultatRecherche } from "@/lib/messages";
import { getUser } from "@/server/session";

export const runtime = "nodejs";

const PORTEE = 5000;
const RESULTATS_MAX = 40;

export async function GET(request: Request) {
  const user = await getUser();
  if (!user || user.role === "PARTENAIRE") return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  const requete = (new URL(request.url).searchParams.get("q") ?? "").trim().slice(0, 100);
  if (requete.length < 2) return NextResponse.json({ resultats: [] });

  const messages = await prisma.message.findMany({
    where: {
      OR: [{ deId: user.id }, { aId: user.id }],
      de: { actif: true, role: { not: "PARTENAIRE" } },
      a: { actif: true, role: { not: "PARTENAIRE" } },
    },
    orderBy: { creeLe: "desc" },
    take: PORTEE,
    select: {
      id: true,
      deId: true,
      aId: true,
      texte: true,
      fichierNom: true,
      duree: true,
      creeLe: true,
      de: { select: { prenom: true, nom: true } },
      a: { select: { prenom: true, nom: true } },
    },
  });

  const resultats: ResultatRecherche[] = [];
  for (const message of messages) {
    const dansTexte = correspond(message.texte, requete);
    if (!dansTexte && !(message.fichierNom && correspond(message.fichierNom, requete))) continue;
    const moi = message.deId === user.id;
    const autre = moi ? message.a : message.de;
    resultats.push({
      id: message.id,
      autreId: moi ? message.aId : message.deId,
      autreNom: `${autre.prenom} ${autre.nom}`.trim(),
      moi,
      extrait: dansTexte ? extraitRecherche(message.texte, requete) : apercuMessage(message),
      creeLe: message.creeLe.toISOString(),
    });
    if (resultats.length >= RESULTATS_MAX) break;
  }
  return NextResponse.json({ resultats });
}
