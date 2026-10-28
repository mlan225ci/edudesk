import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUser } from "@/server/session";
import { controlerFichierMessage, compterFichiersRecents, retirerFichierMessage, stockerFichierMessage, verifierReponse } from "@/server/fichiers-messages";
import { posterDansGroupe } from "@/server/groupes";
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
  const controle = controlerFichierMessage(form.get("fichier"), form.get("duree"));
  if ("error" in controle) return erreur(controle.error);

  const texte = String(form.get("texte") ?? "").replace(/\r/g, "").trim().slice(0, 4000);
  const cle = String(form.get("cle") ?? "").slice(0, 40) || undefined;
  const groupeId = String(form.get("groupeId") ?? "").trim().slice(0, 40);

  const destinataire = groupeId
    ? null
    : await prisma.user.findFirst({
        where: { id: String(form.get("aId") ?? ""), actif: true, role: { not: "PARTENAIRE" } },
        select: { id: true },
      });
  if (!groupeId && (!destinataire || destinataire.id === user.id)) return erreur("Destinataire introuvable.");
  if (groupeId) {
    const membre = await prisma.membreGroupe.findUnique({
      where: { groupeId_userId: { groupeId, userId: user.id } },
      select: { userId: true },
    });
    if (!membre) return erreur("Vous n'êtes pas dans ce groupe.");
  }

  if ((await compterFichiersRecents(user.id)) >= 60) return erreur("Trop de fichiers envoyés en peu de temps. Patientez quelques minutes.", 429);

  const chemin = await stockerFichierMessage(controle.fichier, controle.extension);
  const piece = { nom: controle.nom, chemin, type: controle.type, taille: controle.fichier.size, duree: controle.duree };

  if (groupeId) {
    const resultat = await posterDansGroupe(user, groupeId, texte, piece, cle).catch(async (incident: unknown) => {
      await retirerFichierMessage(chemin);
      throw incident;
    });
    if ("error" in resultat) {
      await retirerFichierMessage(chemin);
      return erreur(resultat.error);
    }
    return NextResponse.json({ message: resultat.message });
  }

  const aId = destinataire?.id;
  if (!aId) return erreur("Destinataire introuvable.");
  const cree = await prisma.message.create({
    data: {
      deId: user.id,
      aId,
      texte,
      fichierNom: piece.nom,
      fichierChemin: piece.chemin,
      fichierType: piece.type,
      fichierTaille: piece.taille,
      duree: piece.duree,
      reponseAId: await verifierReponse(form.get("reponseAId"), user.id, aId),
    },
    include: INCLURE_FLUX,
  });
  const message = versFlux(cree, cle);
  diffuser(aId, { type: "message", message });
  diffuser(user.id, { type: "message", message });
  return NextResponse.json({ message });
}
