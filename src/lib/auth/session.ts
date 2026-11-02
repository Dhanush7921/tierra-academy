import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { asService } from "@/lib/db/client";
import { env, sessionSecret } from "@/lib/env";
import { signJwt, verifyJwt, type SessionClaims } from "@/lib/auth/jwt";
import { can, type Permission, type Role } from "@/lib/rbac";
import { BASE_PATH } from "@/lib/paths";

export const SESSION_COOKIE = "ta_session";
const SESSION_TTL = 60 * 60 * 24 * 7; // 7 days

export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  avatarUrl: string | null;
  roles: Role[];
  aal: 1 | 2;
  hasMfa: boolean;
}

/** Loads the user for verified claims; rejects disabled users and revoked sessions. */
export async function loadSessionUser(claims: SessionClaims): Promise<SessionUser | null> {
  const rows = await asService(
    (tx) => tx`
      select p.id, p.email, p.full_name, p.avatar_url, p.session_version, p.is_disabled, p.deleted_at,
             coalesce(array_agg(ur.role::text) filter (where ur.role is not null), '{}') as roles,
             exists (select 1 from public.mfa_factors f where f.user_id = p.id and f.verified_at is not null) as has_mfa
      from public.profiles p left join public.user_roles ur on ur.user_id = p.id
      where p.id = ${claims.sub}
      group by p.id`,
  );
  const r = rows[0];
  if (!r || r.is_disabled || r.deleted_at || Number(r.session_version) !== claims.sv) return null;
  return {
    id: r.id as string,
    email: r.email as string,
    fullName: (r.full_name as string) || (r.email as string).split("@")[0],
    avatarUrl: (r.avatar_url as string) ?? null,
    roles: r.roles as Role[],
    aal: claims.aal,
    hasMfa: Boolean(r.has_mfa),
  };
}

export const getSession = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const claims = await verifyJwt(token, sessionSecret());
  if (!claims) return null;
  return loadSessionUser(claims);
});

export async function startSession(userId: string, aal: 1 | 2 = 1) {
  const rows = await asService((tx) => tx`select email, session_version from public.profiles where id = ${userId}`);
  if (!rows[0]) throw new Error("profile missing");
  const token = await signJwt(
    { sub: userId, email: rows[0].email as string, role: "authenticated", aal, sv: Number(rows[0].session_version) },
    sessionSecret(),
    SESSION_TTL,
  );
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: env().NODE_ENV === "production",
    sameSite: "lax",
    path: BASE_PATH || "/",
    maxAge: SESSION_TTL,
  });
}

export async function endSession() {
  (await cookies()).set(SESSION_COOKIE, "", { path: BASE_PATH || "/", maxAge: 0 });
}

/** Revoke every session of a user (password change, disable, role change). */
export async function revokeAllSessions(userId: string) {
  await asService((tx) => tx`update public.profiles set session_version = session_version + 1 where id = ${userId}`);
}

async function currentPath(): Promise<string> {
  const h = await headers();
  return h.get("x-pathname") || "/dashboard";
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSession();
  if (!user) redirect(`/login?next=${encodeURIComponent(await currentPath())}`);
  return user;
}

/** Admin panel gate: staff role + MFA (aal2) when enrolled or required. */
export async function requireStaff(): Promise<SessionUser> {
  const user = await requireUser();
  if (!can(user.roles, "admin.access")) redirect("/dashboard?denied=admin");
  if (user.hasMfa && user.aal < 2) redirect(`/mfa?next=${encodeURIComponent(await currentPath())}`);
  if (!user.hasMfa && env().REQUIRE_ADMIN_MFA === "true") redirect("/mfa/setup?required=1");
  return user;
}

export async function requirePermission(permission: Permission): Promise<SessionUser> {
  const user = await requireStaff();
  if (!can(user.roles, permission)) redirect("/admin?denied=1");
  return user;
}
