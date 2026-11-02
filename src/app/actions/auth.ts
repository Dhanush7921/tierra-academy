"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { asService } from "@/lib/db/client";
import { env, encryptionKey } from "@/lib/env";
import { safeNext } from "@/lib/paths";
import { decrypt, encrypt, safeEqual } from "@/lib/crypto";
import { clientIp, LIMITS, rateLimit } from "@/lib/rate-limit";
import { email as emailSchema, loginSchema, password as passwordSchema, registerSchema, zodErrors, type FormState } from "@/lib/validation";
import { createUserWithPassword, requestPasswordReset, resetPassword, signIn, signUp } from "@/lib/auth/provider";
import { endSession, getSession, revokeAllSessions, startSession } from "@/lib/auth/session";
import { generateTotpSecret, verifyTotp } from "@/lib/auth/totp";
import { acceptInvitation } from "@/lib/services/invitations";
import { audit } from "@/lib/services/audit";
import { can } from "@/lib/rbac";

async function ip() {
  return clientIp(await headers());
}

async function postLoginRedirect(userId: string, next: string) {
  const [r] = await asService((tx) => tx`
    select exists (select 1 from public.mfa_factors where user_id = ${userId} and verified_at is not null) as mfa,
           exists (select 1 from public.user_roles where user_id = ${userId} and role in ('SUPER_ADMIN','CONTENT_MANAGER')) as staff`);
  if (r.mfa) {
    await startSession(userId, 1);
    redirect(`/mfa?next=${encodeURIComponent(next)}`);
  }
  await startSession(userId, 1);
  redirect(next === "/dashboard" && r.staff ? "/admin" : next);
}

export async function loginAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const addr = await ip();
  const rl = await rateLimit(`login:${addr}`, ...LIMITS.login);
  if (!rl.ok) return { ok: false, message: `Too many attempts. Try again in ${Math.ceil(rl.resetSeconds / 60)} minutes.` };
  const parsed = loginSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { ok: false, errors: zodErrors(parsed.error) };
  const res = await signIn(parsed.data, addr);
  if (!res.ok) return { ok: false, message: res.error };
  await postLoginRedirect(res.userId, safeNext(String(fd.get("next") || "")));
}

export async function registerAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const addr = await ip();
  const rl = await rateLimit(`register:${addr}`, ...LIMITS.register);
  if (!rl.ok) return { ok: false, message: "Too many sign-ups from your network. Please try later." };
  const parsed = registerSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { ok: false, errors: zodErrors(parsed.error) };
  const res = await signUp(parsed.data, addr);
  if (!res.ok) return { ok: false, message: res.error };
  await startSession(res.userId, 1);
  redirect(safeNext(String(fd.get("next") || ""), "/dashboard?welcome=1"));
}

export async function logoutAction() {
  const u = await getSession();
  await endSession();
  if (u) await audit({ actorId: u.id, action: "auth.logout", entityType: "auth" });
  redirect("/");
}

export async function forgotPasswordAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const rl = await rateLimit(`reset:${await ip()}`, ...LIMITS.passwordReset);
  if (!rl.ok) return { ok: false, message: "Too many requests. Please try later." };
  const parsed = emailSchema.safeParse(fd.get("email"));
  if (!parsed.success) return { ok: false, errors: { email: "Enter a valid email address." } };
  await requestPasswordReset(parsed.data);
  // identical response whether or not the account exists (prevents account enumeration)
  return { ok: true, message: "If an account exists for that email, a reset link is on its way. It expires in 30 minutes." };
}

export async function resetPasswordAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const pw = passwordSchema.safeParse(fd.get("password"));
  if (!pw.success) return { ok: false, errors: { password: pw.error.issues[0].message } };
  if (fd.get("password") !== fd.get("confirm")) return { ok: false, errors: { confirm: "Passwords do not match." } };
  const res = await resetPassword(String(fd.get("token") || ""), pw.data);
  if (!res.ok) return { ok: false, message: res.error };
  return { ok: true, message: "Password updated. All other sessions were signed out. You can now sign in." };
}

// ── MFA (TOTP) ─────────────────────────────────────────────────────────────
export async function verifyMfaAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await getSession();
  if (!user) redirect("/login");
  const rl = await rateLimit(`mfa:${user.id}`, 8, 300);
  if (!rl.ok) return { ok: false, message: "Too many attempts. Wait a few minutes." };
  const code = String(fd.get("code") || "").replace(/\s/g, "");
  const [f] = await asService((tx) => tx`select id, secret_encrypted, last_used_step from public.mfa_factors where user_id = ${user.id} and verified_at is not null`);
  if (!f) redirect("/dashboard");
  const step = verifyTotp(decrypt(f.secret_encrypted as string, encryptionKey()), code);
  if (step === null || (f.last_used_step != null && step <= Number(f.last_used_step))) {
    await audit({ actorId: user.id, action: "auth.mfa_failed", entityType: "auth" });
    return { ok: false, message: "That code is not valid. Check your authenticator app's time and try again." };
  }
  await asService((tx) => tx`update public.mfa_factors set last_used_step = ${step} where id = ${f.id}`);
  await startSession(user.id, 2);
  await audit({ actorId: user.id, action: "auth.mfa_verified", entityType: "auth" });
  redirect(safeNext(String(fd.get("next") || ""), can(user.roles, "admin.access") ? "/admin" : "/dashboard"));
}

export async function beginMfaSetupAction(): Promise<{ secret: string } | { error: string }> {
  const user = await getSession();
  if (!user) return { error: "Not signed in" };
  const secret = generateTotpSecret();
  await asService((tx) => tx`
    insert into public.mfa_factors (user_id, secret_encrypted) values (${user.id}, ${encrypt(secret, encryptionKey())})
    on conflict (user_id, kind) do update set secret_encrypted = excluded.secret_encrypted, verified_at = null, last_used_step = null
    where public.mfa_factors.verified_at is null`);
  const [f] = await asService((tx) => tx`select secret_encrypted, verified_at from public.mfa_factors where user_id = ${user.id}`);
  if (f.verified_at) return { error: "MFA is already enabled. Disable it first to re-enrol." };
  return { secret: decrypt(f.secret_encrypted as string, encryptionKey()) };
}

export async function confirmMfaSetupAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await getSession();
  if (!user) redirect("/login");
  const [f] = await asService((tx) => tx`select id, secret_encrypted from public.mfa_factors where user_id = ${user.id} and verified_at is null`);
  if (!f) return { ok: false, message: "Start the setup again." };
  const step = verifyTotp(decrypt(f.secret_encrypted as string, encryptionKey()), String(fd.get("code") || "").replace(/\s/g, ""));
  if (step === null) return { ok: false, message: "Code did not match. Make sure you scanned the latest QR/secret." };
  await asService((tx) => tx`update public.mfa_factors set verified_at = now(), last_used_step = ${step} where id = ${f.id}`);
  await revokeAllSessions(user.id);
  await startSession(user.id, 2);
  await audit({ actorId: user.id, action: "auth.mfa_enabled", entityType: "auth" });
  return { ok: true, message: "Two-factor authentication is now enabled." };
}

export async function disableMfaAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await getSession();
  if (!user || user.aal < 2) return { ok: false, message: "Verify with your current code first." };
  if (env().REQUIRE_ADMIN_MFA === "true" && can(user.roles, "admin.access")) return { ok: false, message: "MFA is required for administrators on this platform." };
  const [f] = await asService((tx) => tx`select secret_encrypted from public.mfa_factors where user_id = ${user.id} and verified_at is not null`);
  if (!f || verifyTotp(decrypt(f.secret_encrypted as string, encryptionKey()), String(fd.get("code") || "")) === null) return { ok: false, message: "Code did not match." };
  await asService((tx) => tx`delete from public.mfa_factors where user_id = ${user.id}`);
  await audit({ actorId: user.id, action: "auth.mfa_disabled", entityType: "auth" });
  return { ok: true, message: "Two-factor authentication disabled." };
}

// ── one-time Super Admin provisioning ──────────────────────────────────────
const setupSchema = z.object({ token: z.string().min(1), fullName: z.string().trim().min(2).max(120), email: emailSchema, password: passwordSchema });

export async function superAdminExists() {
  const [r] = await asService((tx) => tx`select exists (select 1 from public.user_roles where role = 'SUPER_ADMIN') as e`);
  return Boolean(r.e);
}

export async function provisionSuperAdminAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const rl = await rateLimit(`setup:${await ip()}`, 5, 3600);
  if (!rl.ok) return { ok: false, message: "Too many attempts." };
  const expected = env().SUPER_ADMIN_SETUP_TOKEN;
  if (!expected || expected.length < 24) return { ok: false, message: "Provisioning is disabled (SUPER_ADMIN_SETUP_TOKEN not set)." };
  if (await superAdminExists()) return { ok: false, message: "A Super Admin already exists. Provisioning is permanently closed." };
  const parsed = setupSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { ok: false, errors: zodErrors(parsed.error) };
  if (!safeEqual(parsed.data.token, expected)) {
    await audit({ actorId: null, action: "setup.bad_token", entityType: "auth", ip: await ip() });
    return { ok: false, message: "Invalid setup token." };
  }
  const res = await createUserWithPassword(parsed.data.email, parsed.data.password, parsed.data.fullName);
  if (!res.ok) return { ok: false, message: res.error };
  const granted = await asService(async (tx) => {
    // serialize to guarantee only ONE super admin can be provisioned this way
    await tx`select pg_advisory_xact_lock(424242)`;
    const [exists] = await tx`select exists (select 1 from public.user_roles where role = 'SUPER_ADMIN') as e`;
    if (exists.e) return false;
    await tx`insert into public.user_roles (user_id, role) values (${res.userId}, 'SUPER_ADMIN')`;
    return true;
  });
  if (!granted) return { ok: false, message: "A Super Admin was provisioned concurrently." };
  await audit({ actorId: res.userId, actorRole: "SUPER_ADMIN", action: "setup.super_admin_provisioned", entityType: "profile", entityId: res.userId, ip: await ip() });
  await startSession(res.userId, 1);
  redirect("/mfa/setup?welcome=1");
}

export async function acceptInviteAction(token: string) {
  const user = await getSession();
  if (!user) redirect(`/login?next=/invite/${token}`);
  const r = await acceptInvitation(user, token);
  if (!r.ok) redirect(`/invite/${token}?error=${encodeURIComponent(r.error)}`);
  redirect(r.redirect);
}
