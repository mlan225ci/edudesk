"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import type { EtatAction } from "@/server/actions";
import { requireUser } from "@/server/session";

export async function envoyerMessage(_etat: EtatAction, formData: FormData): Promise<EtatAction> {
  const user = await requireUser();
  if (user.role === "PARTENAIRE") return { error: "Messagerie réservée aux collaborateurs." };
  const texte = String(formData.get("texte") ?? "").replace(/\r/g, "").trim();
  if (!texte) return { error: "Écrivez un message." };
  if (texte.length > 4000) return { error: "Message trop long (4 000 caractères au plus)." };
  const destinataire = await prisma.user.findFirst({
    where: { id: String(formData.get("aId") ?? ""), actif: true, role: { not: "PARTENAIRE" } },
    select: { id: true },
  });
  if (!destinataire || destinataire.id === user.id) return { error: "Destinataire introuvable." };
  await prisma.message.create({ data: { deId: user.id, aId: destinataire.id, texte } });
  revalidatePath("/messages");
  revalidatePath("/", "layout");
  return null;
}
