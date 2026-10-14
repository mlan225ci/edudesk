"use server";

import { prisma } from "@/lib/db";
import { verifierReponse } from "@/server/fichiers-messages";
import { requireUser } from "@/server/session";
import { diffuser, INCLURE_FLUX, versFlux, type MessageFlux } from "@/server/temps-reel";

export async function posterMessage(
  aId: string,
  texteBrut: string,
  cle: string,
  reponseAId?: string | null,
): Promise<{ message: MessageFlux } | { error: string }> {
  const user = await requireUser();
  if (user.role === "PARTENAIRE") return { error: "Messagerie réservée aux collaborateurs." };
  const texte = String(texteBrut ?? "").replace(/\r/g, "").trim();
  if (!texte) return { error: "Écrivez un message." };
  if (texte.length > 4000) return { error: "Message trop long (4 000 caractères au plus)." };
  const destinataire = await prisma.user.findFirst({
    where: { id: String(aId ?? ""), actif: true, role: { not: "PARTENAIRE" } },
    select: { id: true },
  });
  if (!destinataire || destinataire.id === user.id) return { error: "Destinataire introuvable." };
  const cree = await prisma.message.create({
    data: { deId: user.id, aId: destinataire.id, texte, reponseAId: await verifierReponse(reponseAId, user.id, destinataire.id) },
    include: INCLURE_FLUX,
  });
  const message = versFlux(cree, String(cle ?? "").slice(0, 40) || undefined);
  diffuser(destinataire.id, { type: "message", message });
  diffuser(user.id, { type: "message", message });
  return { message };
}

export async function marquerLu(deId: string) {
  const user = await requireUser();
  const { count } = await prisma.message.updateMany({ where: { deId: String(deId ?? ""), aId: user.id, lu: false }, data: { lu: true } });
  if (count > 0) {
    diffuser(deId, { type: "lu", par: user.id });
    diffuser(user.id, { type: "compteur", nonLus: await prisma.message.count({ where: { aId: user.id, lu: false } }) });
  }
}
