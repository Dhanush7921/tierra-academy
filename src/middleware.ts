import { NextResponse, type NextRequest } from "next/server";
import { verifyJwt } from "@/lib/auth/jwt";

/**
 * Edge middleware: fast session presence/signature check for protected areas.
 * Authorization (roles, enrollment, MFA) is re-checked on the server for every page,
 * action and API route — this is only the first gate.
 */
const PROTECTED = ["/dashboard", "/admin", "/checkout", "/mfa"];

function secret() {
  const s = process.env.SESSION_SECRET || "";
  return s.length >= 32 ? s : "dev-only-insecure-session-secret-0123456789abcdef";
}

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const headers = new Headers(req.headers);
  headers.set("x-pathname", pathname + search);

  if (PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    const claims = await verifyJwt(req.cookies.get("ta_session")?.value, secret());
    if (!claims) {
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      url.search = `?next=${encodeURIComponent(pathname + search)}`;
      return NextResponse.redirect(url);
    }
  }
  const res = NextResponse.next({ request: { headers } });
  if (PROTECTED.some((p) => pathname.startsWith(p))) res.headers.set("Cache-Control", "private, no-store");
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|brand/|favicon.ico|icon.png|apple-icon.png|api/payments/webhook|api/videos/webhook|api/live/webhook).*)"],
};
