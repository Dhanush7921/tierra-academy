import { asService, isUniqueViolation } from "@/lib/db/client";
import { env } from "@/lib/env";
import { hashPassword, randomToken, sha256Hex, verifyPassword } from "@/lib/crypto";
import { absoluteUrl } from "@/lib/paths";
import { sendEmail } from "@/lib/providers/email";
import { audit } from "@/lib/services/audit";

/**
 * Authentication adapter.
 *   AUTH_PROVIDER=local    → credentials hashed (scrypt) in public.local_credentials
 *   AUTH_PROVIDER=supabase → Supabase Auth (GoTrue) REST API; Supabase stores credentials
 * Either way the app issues its own short, httpOnly session cookie whose claims mirror
 * Supabase JWTs, and every DB request runs with RLS under that user id.
 */
export type AuthResult = { ok: true; userId: string } | { ok: false; error: string };

const GENERIC_LOGIN_ERROR = "Incorrect email or password.";
const MAX_FAILED = 8;
const LOCK_MINUTES = 15;

export async function ensureProfile(userId: string, email: string, fullName: string) {
  await asService(async (tx) => {
    await tx`insert into public.profiles (id, email, full_name) values (${userId}, ${email}, ${fullName})
             on conflict (id) do nothing`;
    await tx`insert into public.user_roles (user_id, role) values (${userId}, 'STUDENT') on conflict do nothing`;
  });
}

// ── local provider ─────────────────────────────────────────────────────────
async function localSignUp(email: string, password: string, fullName: string): Promise<AuthResult> {
  const hash = await hashPassword(password);
  try {
    const userId = await asService(async (tx) => {
      const [u] = await tx`insert into auth.users (email, raw_user_meta_data, email_confirmed_at)
                           values (${email}, ${tx.json({ full_name: fullName })}, null) returning id`;
      await tx`insert into public.profiles (id, email, full_name) values (${u.id}, ${email}, ${fullName})`;
      await tx`insert into public.user_roles (user_id, role) values (${u.id}, 'STUDENT')`;
      await tx`insert into public.local_credentials (user_id, password_hash) values (${u.id}, ${hash})`;
      return u.id as string;
    });
    return { ok: true, userId };
  } catch (e) {
    if (isUniqueViolation(e)) return { ok: false, error: "An account with this email already exists. Try signing in." };
    throw e;
  }
}

async function localSignIn(email: string, password: string): Promise<AuthResult> {
  const rows = await asService(
    (tx) => tx`select p.id, c.password_hash, c.failed_attempts, c.locked_until, p.is_disabled
               from public.profiles p join public.local_credentials c on c.user_id = p.id
               where p.email = ${email} and p.deleted_at is null`,
  );
  const r = rows[0];
  if (!r) {
    await verifyPassword(password, "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAA"); // equalize timing
    return { ok: false, error: GENERIC_LOGIN_ERROR };
  }
  if (r.locked_until && new Date(r.locked_until as string) > new Date())
    return { ok: false, error: "Too many failed attempts. Try again in a few minutes." };
  if (r.is_disabled) return { ok: false, error: "This account is disabled. Contact the academy team." };
  const valid = await verifyPassword(password, r.password_hash as string);
  await asService(async (tx) => {
    if (valid) await tx`update public.local_credentials set failed_attempts = 0, locked_until = null where user_id = ${r.id}`;
    else
      await tx`update public.local_credentials set failed_attempts = failed_attempts + 1,
               locked_until = case when failed_attempts + 1 >= ${MAX_FAILED} then now() + make_interval(mins => ${LOCK_MINUTES}) else null end
               where user_id = ${r.id}`;
  });
  return valid ? { ok: true, userId: r.id as string } : { ok: false, error: GENERIC_LOGIN_ERROR };
}

async function localRequestReset(email: string) {
  const token = randomToken();
  const rows = await asService(
    (tx) => tx`update public.local_credentials c set reset_token_hash = ${sha256Hex(token)}, reset_expires_at = now() + interval '30 minutes'
               from public.profiles p where p.id = c.user_id and p.email = ${email} and p.deleted_at is null returning p.id`,
  );
  if (rows[0]) {
    const link = absoluteUrl(`/reset-password?token=${token}`);
    await sendEmail({
      to: email,
      subject: "Reset your Tierra Academy password",
      template: "password-reset",
      html: `<p>Use the link below to choose a new password. It expires in 30 minutes.</p><p><a href="${link}">${link}</a></p><p>If you did not request this, you can ignore this email.</p>`,
    });
  }
}

async function localResetPassword(token: string, password: string): Promise<AuthResult> {
  const hash = await hashPassword(password);
  const rows = await asService(
    (tx) => tx`update public.local_credentials set password_hash = ${hash}, reset_token_hash = null, reset_expires_at = null,
               failed_attempts = 0, locked_until = null
               where reset_token_hash = ${sha256Hex(token)} and reset_expires_at > now() returning user_id`,
  );
  if (!rows[0]) return { ok: false, error: "This reset link is invalid or has expired." };
  await asService((tx) => tx`update public.profiles set session_version = session_version + 1 where id = ${rows[0].user_id}`);
  return { ok: true, userId: rows[0].user_id as string };
}

// ── Supabase provider ──────────────────────────────────────────────────────
async function gotrue(path: string, init: { method?: string; body?: unknown; bearer?: string }) {
  const e = env();
  if (!e.NEXT_PUBLIC_SUPABASE_URL || !e.SUPABASE_ANON_KEY) throw new Error("Supabase Auth is not configured");
  const res = await fetch(`${e.NEXT_PUBLIC_SUPABASE_URL}/auth/v1${path}`, {
    method: init.method ?? "POST",
    headers: {
      apikey: e.SUPABASE_ANON_KEY,
      "Content-Type": "application/json",
      Authorization: `Bearer ${init.bearer ?? e.SUPABASE_ANON_KEY}`,
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

async function supabaseSignUp(email: string, password: string, fullName: string): Promise<AuthResult> {
  const r = await gotrue("/signup", { body: { email, password, data: { full_name: fullName } } });
  const id = r.data?.user?.id ?? r.data?.id;
  if (!r.ok || !id) return { ok: false, error: r.data?.msg || r.data?.error_description || "Could not create the account." };
  await ensureProfile(id, email, fullName);
  return { ok: true, userId: id };
}

async function supabaseSignIn(email: string, password: string): Promise<AuthResult> {
  const r = await gotrue("/token?grant_type=password", { body: { email, password } });
  const id = r.data?.user?.id;
  if (!r.ok || !id) return { ok: false, error: GENERIC_LOGIN_ERROR };
  await ensureProfile(id, email, r.data.user.user_metadata?.full_name ?? "");
  return { ok: true, userId: id };
}

// ── public API ─────────────────────────────────────────────────────────────
export async function signUp(input: { email: string; password: string; fullName: string }, ip?: string): Promise<AuthResult> {
  const email = input.email.trim().toLowerCase();
  const res = env().AUTH_PROVIDER === "supabase"
    ? await supabaseSignUp(email, input.password, input.fullName)
    : await localSignUp(email, input.password, input.fullName);
  if (res.ok) await audit({ actorId: res.userId, action: "auth.register", entityType: "profile", entityId: res.userId, ip });
  return res;
}

export async function signIn(input: { email: string; password: string }, ip?: string): Promise<AuthResult> {
  const email = input.email.trim().toLowerCase();
  const res = env().AUTH_PROVIDER === "supabase" ? await supabaseSignIn(email, input.password) : await localSignIn(email, input.password);
  await audit({ actorId: res.ok ? res.userId : null, action: res.ok ? "auth.login" : "auth.login_failed", entityType: "auth", entityId: email, ip });
  return res;
}

export async function requestPasswordReset(email: string) {
  const e = email.trim().toLowerCase();
  if (env().AUTH_PROVIDER === "supabase") {
    await gotrue("/recover", { body: { email: e, redirect_to: absoluteUrl("/reset-password") } });
  } else {
    await localRequestReset(e);
  }
}

/** token = local reset token, or the Supabase recovery access_token from the email link. */
export async function resetPassword(token: string, password: string): Promise<AuthResult> {
  if (env().AUTH_PROVIDER === "supabase") {
    const r = await gotrue("/user", { method: "PUT", bearer: token, body: { password } });
    if (!r.ok || !r.data?.id) return { ok: false, error: "This reset link is invalid or has expired." };
    await asService((tx) => tx`update public.profiles set session_version = session_version + 1 where id = ${r.data.id}`);
    return { ok: true, userId: r.data.id };
  }
  return localResetPassword(token, password);
}

export async function changePassword(userId: string, current: string, next: string): Promise<AuthResult> {
  if (env().AUTH_PROVIDER === "supabase") return { ok: false, error: "Use 'Forgot password' to change a Supabase-managed password." };
  const rows = await asService((tx) => tx`select password_hash from public.local_credentials where user_id = ${userId}`);
  if (!rows[0] || !(await verifyPassword(current, rows[0].password_hash as string))) return { ok: false, error: "Current password is incorrect." };
  const hash = await hashPassword(next);
  await asService(async (tx) => {
    await tx`update public.local_credentials set password_hash = ${hash} where user_id = ${userId}`;
    await tx`update public.profiles set session_version = session_version + 1 where id = ${userId}`;
  });
  return { ok: true, userId };
}

/** Used by provisioning + admin team creation (local provider). */
export async function createUserWithPassword(email: string, password: string, fullName: string): Promise<AuthResult> {
  return env().AUTH_PROVIDER === "supabase" ? supabaseSignUp(email.toLowerCase(), password, fullName) : localSignUp(email.toLowerCase(), password, fullName);
}
