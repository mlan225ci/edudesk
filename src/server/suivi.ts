"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { normaliserCodeSuivi } from "@/lib/suivi";

export type EtatSuivi = { error: string; saisie?: string } | null;

const COOKIE = "edudesk_suivi";
const FENETRE = 15 * 60_000;
const ESSAIS_MAX = 8;
const echecs = new Map<string, { nombre: number; depuis: number }>();

async function adresse() {
  const entetes = await headers();
  return entetes.get("x-forwarded-for")?.split(",")[0]?.trim() || entetes.get("x-real-ip") || "local";
}

export async function consulterSuivi(_etat: EtatSuivi, formData: FormData): Promise<EtatSuivi> {
  const ip = await adresse();
  const maintenant = Date.now();
  const compteur = echecs.get(ip);
  if (compteur && maintenant - compteur.depuis < FENETRE && compteur.nombre >= ESSAIS_MAX) {
    return { error: "Trop d'essais. Patientez quelques minutes puis réessayez." };
  }

  const saisie = String(formData.get("code") ?? "").slice(0, 12);
  const code = normaliserCodeSuivi(saisie);
  const dossier = code ? await prisma.dossier.findUnique({ where: { codeSuivi: code }, select: { id: true } }) : null;
  if (!code || !dossier) {
    const actuel = compteur && maintenant - compteur.depuis < FENETRE ? compteur : { nombre: 0, depuis: maintenant };
    echecs.set(ip, { nombre: actuel.nombre + 1, depuis: actuel.depuis });
    return { error: "Code inconnu. Vérifiez le code reçu par SMS, par exemple K7MP-4XRT.", saisie };
  }

  echecs.delete(ip);
  (await cookies()).set(COOKIE, code, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/suivi",
    maxAge: 60 * 60 * 24 * 30,
  });
  redirect("/suivi");
}

export async function quitterSuivi() {
  (await cookies()).delete({ name: COOKIE, path: "/suivi" });
  redirect("/suivi");
}
