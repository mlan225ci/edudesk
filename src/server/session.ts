import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import type { SessionUser } from "@/server/permissions";

const COOKIE = "edudesk_session";
const COOKIE_CODE = "edudesk_code";

function secret() {
  const value = process.env.AUTH_SECRET;
  if (!value) throw new Error("AUTH_SECRET manquant");
  return new TextEncoder().encode(value);
}

function optionsCookie(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.COOKIE_SECURE === "0" ? false : process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}

export async function ouvrirSession(userId: string, souvenir = false) {
  const duree = souvenir ? "30d" : "12h";
  const token = await new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(duree)
    .sign(secret());
  const jar = await cookies();
  jar.set(COOKIE, token, optionsCookie(souvenir ? 60 * 60 * 24 * 30 : 60 * 60 * 12));
  jar.delete(COOKIE_CODE);
}

export async function ouvrirAttenteCode(userId: string, souvenir: boolean) {
  const token = await new SignJWT({ sub: userId, souvenir, but: "code" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(secret());
  const jar = await cookies();
  jar.set(COOKIE_CODE, token, optionsCookie(60 * 10));
}

export async function lireAttenteCode() {
  const token = (await cookies()).get(COOKIE_CODE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (!payload.sub || payload.but !== "code") return null;
    return { userId: payload.sub, souvenir: payload.souvenir === true };
  } catch {
    return null;
  }
}

export async function fermerAttenteCode() {
  const jar = await cookies();
  jar.delete(COOKIE_CODE);
}

export async function fermerSession() {
  const jar = await cookies();
  jar.delete(COOKIE);
  jar.delete(COOKIE_CODE);
}

export async function getUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (!payload.sub) return null;
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user?.actif) return null;
    return user;
  } catch {
    return null;
  }
}

export async function requireUser() {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}
