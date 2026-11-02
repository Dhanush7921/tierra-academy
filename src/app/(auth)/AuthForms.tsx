"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { loginAction, registerAction, forgotPasswordAction, resetPasswordAction, verifyMfaAction, confirmMfaSetupAction, beginMfaSetupAction, provisionSuperAdminAction } from "@/app/actions/auth";
import { Alert, Field, Input } from "@/components/ui/primitives";
import { CopyButton, SubmitButton } from "@/components/ui/client";
import type { FormState } from "@/lib/validation";

export function LoginForm({ next }: { next?: string }) {
  const [s, a] = useActionState<FormState, FormData>(loginAction, undefined);
  return (
    <form action={a} className="space-y-4" noValidate>
      <input type="hidden" name="next" value={next ?? ""} />
      <Field label="Email" htmlFor="email" error={s?.errors?.email}><Input id="email" name="email" type="email" autoComplete="email" required autoFocus /></Field>
      <Field label="Password" htmlFor="password" error={s?.errors?.password}><Input id="password" name="password" type="password" autoComplete="current-password" required /></Field>
      <div className="flex justify-end"><Link href="/forgot-password" className="text-sm text-brand-strong hover:underline">Forgot password?</Link></div>
      {s?.message && <Alert tone="danger">{s.message}</Alert>}
      <SubmitButton size="lg" className="w-full" pendingText="Signing in…">Sign in</SubmitButton>
    </form>
  );
}

export function RegisterForm({ next }: { next?: string }) {
  const [s, a] = useActionState<FormState, FormData>(registerAction, undefined);
  return (
    <form action={a} className="space-y-4" noValidate>
      <input type="hidden" name="next" value={next ?? ""} />
      <Field label="Full name" htmlFor="fullName" error={s?.errors?.fullName}><Input id="fullName" name="fullName" autoComplete="name" required autoFocus /></Field>
      <Field label="Email" htmlFor="email" error={s?.errors?.email}><Input id="email" name="email" type="email" autoComplete="email" required /></Field>
      <Field label="Password" htmlFor="password" hint="At least 10 characters with a letter and a number." error={s?.errors?.password}><Input id="password" name="password" type="password" autoComplete="new-password" required minLength={10} /></Field>
      <label className="flex items-start gap-2.5 text-sm text-fg-2"><input type="checkbox" name="accept" className="mt-1 accent-[var(--brand)]" required /><span>I agree to the <Link href="/terms" className="underline">Terms</Link> and <Link href="/privacy" className="underline">Privacy Policy</Link>.</span></label>
      {s?.errors?.accept && <p className="text-xs text-danger">{s.errors.accept}</p>}
      {s?.message && <Alert tone="danger">{s.message}</Alert>}
      <SubmitButton size="lg" className="w-full" pendingText="Creating account…">Create student account</SubmitButton>
    </form>
  );
}

export function ForgotForm() {
  const [s, a] = useActionState<FormState, FormData>(forgotPasswordAction, undefined);
  if (s?.ok) return <Alert tone="ok">{s.message}</Alert>;
  return (
    <form action={a} className="space-y-4" noValidate>
      <Field label="Email" htmlFor="email" error={s?.errors?.email}><Input id="email" name="email" type="email" autoComplete="email" required autoFocus /></Field>
      {s?.message && <Alert tone="danger">{s.message}</Alert>}
      <SubmitButton size="lg" className="w-full" pendingText="Sending…">Send reset link</SubmitButton>
    </form>
  );
}

export function ResetForm({ token: initial }: { token?: string }) {
  const [s, a] = useActionState<FormState, FormData>(resetPasswordAction, undefined);
  const [token, setToken] = useState(initial ?? "");
  useEffect(() => {
    // Supabase recovery links put the access token in the URL fragment
    const h = new URLSearchParams(window.location.hash.slice(1));
    if (!initial && h.get("access_token")) setToken(h.get("access_token")!);
  }, [initial]);
  if (s?.ok) return <div className="space-y-4"><Alert tone="ok">{s.message}</Alert><Link href="/login" className="text-brand-strong underline">Sign in</Link></div>;
  return (
    <form action={a} className="space-y-4" noValidate>
      <input type="hidden" name="token" value={token} />
      <Field label="New password" htmlFor="password" error={s?.errors?.password}><Input id="password" name="password" type="password" autoComplete="new-password" required /></Field>
      <Field label="Confirm password" htmlFor="confirm" error={s?.errors?.confirm}><Input id="confirm" name="confirm" type="password" autoComplete="new-password" required /></Field>
      {!token && <Alert tone="warn">Open this page from the link in your reset email.</Alert>}
      {s?.message && <Alert tone="danger">{s.message}</Alert>}
      <SubmitButton size="lg" className="w-full" pendingText="Saving…">Set new password</SubmitButton>
    </form>
  );
}

export function MfaForm({ next }: { next?: string }) {
  const [s, a] = useActionState<FormState, FormData>(verifyMfaAction, undefined);
  return (
    <form action={a} className="space-y-4">
      <input type="hidden" name="next" value={next ?? ""} />
      <Field label="6-digit code from your authenticator app" htmlFor="code"><Input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} required autoFocus className="text-center font-mono text-xl tracking-[0.4em]" /></Field>
      {s?.message && <Alert tone="danger">{s.message}</Alert>}
      <SubmitButton size="lg" className="w-full" pendingText="Verifying…">Verify</SubmitButton>
    </form>
  );
}

export function MfaSetup({ email }: { email: string }) {
  const [secret, setSecret] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [s, a] = useActionState<FormState, FormData>(confirmMfaSetupAction, undefined);
  useEffect(() => { beginMfaSetupAction().then((r) => ("secret" in r ? setSecret(r.secret) : setErr(r.error))); }, []);
  if (s?.ok) return <div className="space-y-4"><Alert tone="ok">{s.message}</Alert><Link href="/admin" className="text-brand-strong underline">Continue</Link></div>;
  if (err) return <Alert tone="info">{err}</Alert>;
  if (!secret) return <div className="skeleton h-40" />;
  const uri = `otpauth://totp/${encodeURIComponent("Tierra Academy")}:${encodeURIComponent(email)}?secret=${secret}&issuer=${encodeURIComponent("Tierra Academy")}&digits=6&period=30`;
  return (
    <div className="space-y-5">
      <ol className="list-decimal space-y-2 pl-5 text-sm text-fg-2">
        <li>Open an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password, Authy).</li>
        <li>Add an account → <b>enter a setup key</b>, and paste the key below (time-based, 6 digits).</li>
        <li>Enter the 6-digit code it shows.</li>
      </ol>
      <div className="glass rounded-xl p-4">
        <p className="label-mono mb-1">Setup key</p>
        <p className="break-all font-mono text-lg tracking-wider">{secret.match(/.{1,4}/g)!.join(" ")}</p>
        <div className="mt-3 flex flex-wrap gap-2"><CopyButton text={secret} label="Copy key" /><CopyButton text={uri} label="Copy otpauth link" /></div>
      </div>
      <form action={a} className="space-y-3">
        <Field label="Code from the app" htmlFor="code"><Input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} required className="text-center font-mono text-xl tracking-[0.4em]" /></Field>
        {s?.message && <Alert tone="danger">{s.message}</Alert>}
        <SubmitButton className="w-full" pendingText="Enabling…">Enable two-factor authentication</SubmitButton>
      </form>
    </div>
  );
}

export function SetupForm() {
  const [s, a] = useActionState<FormState, FormData>(provisionSuperAdminAction, undefined);
  return (
    <form action={a} className="space-y-4" noValidate>
      <Field label="Setup token" htmlFor="token" hint="The value of SUPER_ADMIN_SETUP_TOKEN from the server environment." error={s?.errors?.token}><Input id="token" name="token" type="password" autoComplete="off" required /></Field>
      <Field label="Full name" htmlFor="fullName" error={s?.errors?.fullName}><Input id="fullName" name="fullName" required /></Field>
      <Field label="Email" htmlFor="email" error={s?.errors?.email}><Input id="email" name="email" type="email" required /></Field>
      <Field label="Password" htmlFor="password" error={s?.errors?.password}><Input id="password" name="password" type="password" autoComplete="new-password" required /></Field>
      {s?.message && <Alert tone="danger">{s.message}</Alert>}
      <SubmitButton size="lg" className="w-full" pendingText="Provisioning…">Create Super Admin</SubmitButton>
    </form>
  );
}
