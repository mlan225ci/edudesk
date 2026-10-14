import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUser } from "@/server/session";
import { EXTENSIONS_AUDIO, REPERTOIRE_MESSAGES, TAILLE_MAX_MESSAGE, TYPES_MESSAGES, verifierReponse } from "@/server/fichiers-messages";
import { diffuser, INCLURE_FLUX, versFlux } from "@/server/temps-reel";

export const runtime = "nodejs";

function erreur(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  const user = await getUser();
  if (!user || user.role === "PARTENAIRE") return erreur("Messagerie réservée aux collaborateurs.", 401);

  const form = await request.formData().catch(() => null);
  if (!form) return erreur("Envoi illisible. Réessayez.");
  const fichier = form.get("fichier");
  if (!(fichier instanceof File) || fichier.size === 0) return erreur("Choisissez un fichier.");
  if (fichier.size > TAILLE_MAX_MESSAGE) return erreur("Le fichier dépasse 10 Mo.");
  const nomOrigine = fichier.name.slice(0, 160) || "fichier";
  const extension = path.extname(nomOrigine).toLowerCase();
  const type = TYPES_MESSAGES[extension];
  if (!type) return erreur("Format non accepté. Envoyez un PDF, une image, un document Office, un texte, un ZIP ou un audio.");

  const texte = String(form.get("texte") ?? "").replace(/\r/g, "").trim().slice(0, 4000);
  const cle = String(form.get("cle") ?? "").slice(0, 40) || undefined;
  const dureeBrute = Number(form.get("duree"));
  const duree = EXTENSIONS_AUDIO.has(extension) && Number.isFinite(dureeBrute) && dureeBrute >= 0 ? Math.min(Math.round(dureeBrute), 3600) : null;

  const destinataire = await prisma.user.findFirst({
    where: { id: String(form.get("aId") ?? ""), actif: true, role: { not: "PARTENAIRE" } },
    select: { id: true },
  });
  if (!destinataire || destinataire.id === user.id) return erreur("Destinataire introuvable.");

  const recents = await prisma.message.count({
    where: { deId: user.id, fichierChemin: { not: null }, creeLe: { gte: new Date(Date.now() - 10 * 60_000) } },
  });
  if (recents >= 60) return erreur("Trop de fichiers envoyés en peu de temps. Patientez quelques minutes.", 429);

  await mkdir(REPERTOIRE_MESSAGES, { recursive: true });
  const chemin = `${Date.now()}-${randomBytes(8).toString("hex")}${extension}`;
  await writeFile(path.join(REPERTOIRE_MESSAGES, chemin), Buffer.from(await fichier.arrayBuffer()));

  const cree = await prisma.message.create({
    data: {
      deId: user.id,
      aId: destinataire.id,
      texte,
      fichierNom: nomOrigine,
      fichierChemin: chemin,
      fichierType: type,
      fichierTaille: fichier.size,
      duree,
      reponseAId: await verifierReponse(form.get("reponseAId"), user.id, destinataire.id),
    },
    include: INCLURE_FLUX,
  });
  const message = versFlux(cree, cle);
  diffuser(destinataire.id, { type: "message", message });
  diffuser(user.id, { type: "message", message });
  return NextResponse.json({ message });
}
