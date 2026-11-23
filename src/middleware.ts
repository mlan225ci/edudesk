import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

// L'hébergeur (Apache) peut transmettre la page d'index du dossier web au lieu de « / ».
const INDEX_SERVEUR = new Set(["/index.html", "/index.htm", "/index.php", "/standard_index.html"]);

function estTelephone(ua: string) {
  if (/iPad|Tablet|Kindle|PlayBook|Silk/i.test(ua)) return false;
  return /iPhone|iPod|Android.+Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua);
}

function passer(request: NextRequest) {
  const entetes = new Headers(request.headers);
  entetes.set("x-pathname", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  if (INDEX_SERVEUR.has(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.rewrite(url, { request: { headers: entetes } });
  }
  return NextResponse.next({ request: { headers: entetes } });
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const ouvertAuTelephone =
    pathname.startsWith("/suivi") ||
    pathname.startsWith("/contact") ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/telephone");
  if (estTelephone(request.headers.get("user-agent") ?? "") && !ouvertAuTelephone) {
    const url = request.nextUrl.clone();
    url.pathname = "/telephone";
    url.search = "";
    return NextResponse.redirect(url);
  }
  if (pathname.startsWith("/login") || pathname.startsWith("/suivi") || pathname.startsWith("/contact") || pathname.startsWith("/telephone") || pathname.startsWith("/api/cron") || pathname === "/googled80d645c8efe0178.html") {
    return passer(request);
  }

  const token = request.cookies.get("edudesk_session")?.value;
  if (!token) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  try {
    const secret = process.env.AUTH_SECRET;
    if (!secret) throw new Error("secret");
    await jwtVerify(token, new TextEncoder().encode(secret));
    return passer(request);
  } catch {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|logo-edudesk.png|googled80d645c8efe0178.html).*)"],
};
