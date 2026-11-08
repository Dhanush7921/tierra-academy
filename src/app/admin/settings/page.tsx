import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { asUser } from "@/lib/db/client";
import { env } from "@/lib/env";
import * as A from "../actions";
import { Flash, type SP } from "../Flash";
import { Badge, Card, Field, Input, PageHeader, buttonClass } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/client";
import { formatDateTime } from "@/lib/format";
import { checkoutReadiness } from "@/lib/services/price-options";

export const metadata: Metadata = { title: "Settings · Admin" };

export default async function Settings({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const user = await requirePermission("settings.manage");
  const e = env();
  const [settings, contacts] = await asUser(user, async (tx) => [
    await tx`select key, value from public.platform_settings`,
    await tx`select * from public.contact_messages order by handled_at nulls first, created_at desc limit 30`,
  ]);
  const readiness = await checkoutReadiness();
  const tax = readiness.tax;
  const support = (settings.find((s) => s.key === "support")?.value ?? {}) as Record<string, string>;
  const providers: [string, string, boolean][] = [
    ["Mode", e.APP_MODE, e.APP_MODE === "production"],
    ["Authentication", e.AUTH_PROVIDER === "supabase" ? "Supabase Auth" : "Local (app database)", true],
    ["Payments", e.PAYMENTS_PROVIDER === "razorpay" ? `Razorpay (${e.RAZORPAY_KEY_ID.startsWith("rzp_live") ? "LIVE" : "test"} keys)` : "DEMO simulator", e.PAYMENTS_PROVIDER === "razorpay"],
    ["Live classes", e.LIVE_PROVIDER === "zoom" ? "Zoom Meeting SDK" : "DEMO classroom", e.LIVE_PROVIDER === "zoom"],
    ["Video", e.VIDEO_PROVIDER === "cloudflare" ? "Cloudflare Stream" : "Local dev storage", e.VIDEO_PROVIDER === "cloudflare"],
    ["File storage", e.STORAGE_PROVIDER === "supabase" ? "Supabase Storage" : "Local dev storage", e.STORAGE_PROVIDER === "supabase"],
    ["Email", e.EMAIL_PROVIDER === "resend" ? "Resend" : "Dev outbox (not delivered)", e.EMAIL_PROVIDER === "resend"],
    ["Rate limiting", e.UPSTASH_REDIS_REST_URL ? "Upstash Redis (shared)" : "In-memory (per instance)", Boolean(e.UPSTASH_REDIS_REST_URL)],
    ["Admin MFA required", e.REQUIRE_ADMIN_MFA === "true" ? "Yes" : "No (optional)", e.REQUIRE_ADMIN_MFA === "true"],
  ];
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Flash sp={sp} />
      <PageHeader eyebrow="Platform" title="Settings" description="Provider credentials are configured as server environment variables (never in the database or browser)." />
      <Card id="tax" className="p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Tax &amp; checkout</h2>
          <Badge tone={readiness.ready ? "ok" : "warn"}>{readiness.ready ? "Checkout open" : "Checkout closed"}</Badge>
        </div>
        {readiness.reason && <p className="mb-4 text-sm text-muted">{readiness.reason}</p>}
        <form action={A.saveTaxAction} className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <Field label="Tax name (as on invoices)" htmlFor="taxLabel"><Input id="taxLabel" name="label" defaultValue={tax.label} placeholder="e.g. GST" /></Field>
          <Field label="Rate (%)" htmlFor="taxRate" hint="Confirm the applicable rate with your accountant."><Input id="taxRate" name="rate" type="number" min="0" max="100" step="0.01" defaultValue={String(tax.rateBp / 100)} /></Field>
          <SubmitButton>Save tax</SubmitButton>
          <label className="flex items-center gap-2 text-sm sm:col-span-3"><input type="checkbox" name="configured" defaultChecked={tax.configured} className="size-4 accent-[var(--brand)]" />This tax setup is final and may be charged to students</label>
        </form>
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-3 font-semibold">Integrations status</h2>
          <ul className="divide-y divide-line text-sm">{providers.map(([k, v, live]) => <li key={k} className="flex items-center justify-between py-2"><span className="text-muted">{k}</span><span className="flex items-center gap-2">{v}<Badge tone={live ? "ok" : "warn"}>{live ? "production" : "demo/dev"}</Badge></span></li>)}</ul>
          <Link href="/api/health" className={buttonClass("outline", "sm", "mt-4")} target="_blank">Health check</Link>
        </Card>
        <Card className="p-5">
          <h2 className="mb-3 font-semibold">Support contact</h2>
          <form action={A.saveSettingsAction} className="grid gap-3">
            <Field label="Support email" htmlFor="supportEmail"><Input id="supportEmail" name="supportEmail" type="email" defaultValue={support.email ?? ""} required /></Field>
            <Field label="Phone" htmlFor="supportPhone"><Input id="supportPhone" name="supportPhone" defaultValue={support.phone ?? ""} /></Field>
            <Field label="WhatsApp" htmlFor="supportWhatsapp"><Input id="supportWhatsapp" name="supportWhatsapp" defaultValue={support.whatsapp ?? ""} /></Field>
            <SubmitButton>Save</SubmitButton>
          </form>
          <div className="mt-6 border-t border-line pt-4"><p className="text-sm font-semibold">Your account security</p><p className="text-sm text-muted">{user.hasMfa ? "Two-factor authentication is enabled." : "Enable two-factor authentication for your admin account."}</p>{!user.hasMfa && <Link href="/mfa/setup" className={buttonClass("primary", "sm", "mt-2")}>Enable 2FA</Link>}</div>
        </Card>
      </div>
      <Card id="contact" className="p-5">
        <h2 className="mb-3 font-semibold">Contact messages</h2>
        {contacts.length ? <ul className="divide-y divide-line">{contacts.map((c) => (
          <li key={c.id as string} className="flex flex-wrap items-start justify-between gap-3 py-3 text-sm">
            <div className="max-w-2xl"><p className="font-semibold">{c.name as string} <span className="font-normal text-muted">{c.email as string} · {c.topic as string} · {formatDateTime(c.created_at as string)}</span></p><p className="mt-1 whitespace-pre-wrap text-fg-2">{c.message as string}</p></div>
            {c.handled_at ? <Badge tone="ok">handled</Badge> : <form action={A.markContactHandledAction.bind(null, c.id as string)}><SubmitButton size="sm" variant="outline">Mark handled</SubmitButton></form>}
          </li>
        ))}</ul> : <p className="text-sm text-muted">No messages yet.</p>}
      </Card>
    </div>
  );
}
