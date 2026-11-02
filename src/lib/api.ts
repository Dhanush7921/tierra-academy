import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyJwt } from "@/lib/auth/jwt";
import { loadSessionUser, SESSION_COOKIE, type SessionUser } from "@/lib/auth/session";
import { env, sessionSecret } from "@/lib/env";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { can, type Permission } from "@/lib/rbac";

export const json = (data: unknown, status = 200, headers?: Record<string, string>) =>
  NextResponse.json(data, { status, headers: { "Cache-Control": "no-store", ...headers } });

export const apiError = (status: number, error: string) => json({ error }, status);

export async function apiUser(): Promise<SessionUser | null> {
  const claims = await verifyJwt((await cookies()).get(SESSION_COOKIE)?.value, sessionSecret());
  return claims ? loadSessionUser(claims) : null;
}

/**
 * CSRF defence for cookie-authenticated JSON endpoints: the Origin (or Referer) must match
 * this deployment. SameSite=Lax cookies + this check block cross-site form/fetch posts.
 */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin") || req.headers.get("referer");
  if (!origin) return false;
  try {
    const o = new URL(origin);
    const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
    const allowed = new URL(env().NEXT_PUBLIC_APP_URL);
    return o.host === host || o.host === allowed.host;
  } catch {
    return false;
  }
}

type Guard = { user: SessionUser; error?: undefined } | { user?: undefined; error: NextResponse };

/** Auth + optional permission + CSRF + rate limit, in one call. */
export async function guard(req: Request, opts: { permission?: Permission; csrf?: boolean; limit?: readonly [number, number]; key?: string } = {}): Promise<Guard> {
  if (opts.csrf !== false && req.method !== "GET" && !sameOrigin(req)) return { error: apiError(403, "Cross-site request blocked.") };
  const user = await apiUser();
  if (!user) return { error: apiError(401, "Sign in required.") };
  if (opts.permission && !can(user.roles, opts.permission)) return { error: apiError(403, "You do not have permission for this action.") };
  if (opts.permission && can(user.roles, "admin.access") && user.hasMfa && user.aal < 2) return { error: apiError(403, "Two-factor verification required.") };
  if (opts.limit) {
    const rl = await rateLimit(`${opts.key ?? new URL(req.url).pathname}:${user.id}`, ...opts.limit);
    if (!rl.ok) return { error: json({ error: "Too many requests." }, 429, { "Retry-After": String(rl.resetSeconds) }) };
  }
  return { user };
}

export async function ipLimit(req: Request, key: string, limit: readonly [number, number]) {
  return rateLimit(`${key}:${clientIp(req.headers)}`, ...limit);
}

export function reportError(where: string, e: unknown) {
  console.error(`[${where}]`, e);
  const hook = env().ERROR_WEBHOOK_URL;
  if (hook) fetch(hook, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ where, message: String((e as Error)?.message ?? e), at: new Date().toISOString() }) }).catch(() => {});
}
