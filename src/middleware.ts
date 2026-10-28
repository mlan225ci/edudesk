import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

function passer(request: NextRequest) {
  const entetes = new Headers(request.headers);
  entetes.set("x-pathname", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.next({ request: { headers: entetes } });
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/login") || pathname.startsWith("/suivi") || pathname.startsWith("/api/cron")) {
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
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|logo-edudesk.png).*)"],
};
