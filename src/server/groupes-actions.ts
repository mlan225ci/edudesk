"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { EtatAction } from "@/server/actions";
import { ajouterMembresGroupe, ouvrirOuCreerGroupeClient, posterDansGroupe, type MessageGroupeVue } from "@/server/groupes";
import { requireUser } from "@/server/session";

export async function ouvrirGroupeClient(formData: FormData) {
  const user = await requireUser();
  const resultat = await ouvrirOuCreerGroupeClient(user, String(formData.get("clientId") ?? ""));
  if ("error" in resultat) return;
  revalidatePath("/messages");
  redirect(`/messages?groupe=${resultat.id}`);
}

export async function creerGroupeClient(_etat: EtatAction, formData: FormData): Promise<EtatAction> {
  const user = await requireUser();
  const resultat = await ouvrirOuCreerGroupeClient(user, String(formData.get("clientId") ?? ""));
  if (!("id" in resultat)) return { error: resultat.error };
  const ids = formData.getAll("membre").map(String);
  if (ids.length) {
    const ajout = await ajouterMembresGroupe(user, resultat.id, ids);
    if (!("ok" in ajout)) return { error: ajout.error };
  }
  revalidatePath("/messages");
  redirect(`/messages?groupe=${resultat.id}`);
}

export async function inviterDansGroupe(_etat: EtatAction, formData: FormData): Promise<EtatAction> {
  const user = await requireUser();
  const groupeId = String(formData.get("groupeId") ?? "");
  const resultat = await ajouterMembresGroupe(user, groupeId, formData.getAll("membre").map(String));
  if (!("ok" in resultat)) return { error: resultat.error };
  revalidatePath("/messages");
  return null;
}

export async function envoyerMessageGroupe(groupeId: string, texte: string): Promise<{ message: MessageGroupeVue } | { error: string }> {
  const user = await requireUser();
  return posterDansGroupe(user, groupeId, texte);
}
