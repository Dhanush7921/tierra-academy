"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { startCheckoutAction, type CheckoutState } from "@/app/actions/public";
import { Alert, Card, Field, Input, buttonClass } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/client";
import { formatMoney } from "@/lib/format";
import { apiPath } from "@/lib/paths";

declare global {
  interface Window { Razorpay?: new (o: Record<string, unknown>) => { open: () => void; on: (e: string, f: (r: unknown) => void) => void } }
}

function loadRazorpay(): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

export function CheckoutPanel({ courseId, slug, provider, user }: { courseId: string; slug: string; provider: "demo" | "razorpay"; user: { name: string; email: string } }) {
  const router = useRouter();
  const [state, action] = useActionState<CheckoutState, FormData>(startCheckoutAction, undefined);
  const [status, setStatus] = useState<{ tone: "info" | "ok" | "danger" | "warn"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!state?.ok) return;
    if (state.fulfilled) { router.push(`/dashboard/courses?enrolled=${slug}`); return; }
    if (state.provider === "razorpay") {
      (async () => {
        if (!(await loadRazorpay()) || !window.Razorpay) { setStatus({ tone: "danger", text: "Could not load Razorpay Checkout. Check your connection and retry." }); return; }
        const rz = new window.Razorpay({
          key: state.keyId, order_id: state.providerOrderId, amount: state.amountPaise, currency: state.currency,
          name: "Tierra Academy", description: "Course purchase", prefill: { name: user.name, email: user.email }, theme: { color: "#FF7A00" },
          handler: async (resp: Record<string, string>) => {
            setStatus({ tone: "info", text: "Verifying payment with the server…" });
            const r = await fetch(apiPath("/payments/razorpay/verify"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(resp) });
            const j = await r.json();
            if (j.ok) router.push(`/dashboard/courses?enrolled=${slug}`);
            else setStatus({ tone: "warn", text: j.error ?? "We could not verify the payment yet. If money was deducted, access unlocks automatically once Razorpay confirms it." });
          },
          modal: { ondismiss: () => setStatus({ tone: "warn", text: "Payment window closed. You can retry any time." }) },
        });
        rz.on("payment.failed", () => setStatus({ tone: "danger", text: "Payment failed. No access was granted. You can retry." }));
        rz.open();
      })();
    }
  }, [state, router, slug, user]);

  const simulate = async (outcome: "success" | "failure" | "cancel") => {
    if (!state?.ok) return;
    setBusy(true);
    const r = await fetch(apiPath("/payments/demo/simulate"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId: state.orderId, outcome }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (j.status === "PAID") { setStatus({ tone: "ok", text: "Demo payment verified on the server — course unlocked." }); router.push(`/dashboard/courses?enrolled=${slug}`); }
    else if (j.status === "FAILED") setStatus({ tone: "danger", text: "Simulated failure recorded. The course remains locked." });
    else if (j.status === "CANCELLED") setStatus({ tone: "warn", text: "Checkout cancelled. Nothing was charged." });
    else setStatus({ tone: "danger", text: j.error ?? "Something went wrong." });
  };

  const awaitingDemo = state?.ok && state.provider === "demo" && !state.fulfilled;

  return (
    <Card strong className="p-6">
      {!awaitingDemo ? (
        <form action={action} className="space-y-4">
          <input type="hidden" name="courseId" value={courseId} />
          <Field label="Coupon code (optional)" htmlFor="coupon" hint={provider === "demo" ? "Demo coupons: WELCOME10, TIERRA500, DEMOFREE100" : undefined}>
            <Input id="coupon" name="coupon" placeholder="e.g. WELCOME10" autoComplete="off" />
          </Field>
          {state && !state.ok && <Alert tone="danger">{state.error}</Alert>}
          <SubmitButton size="lg" className="w-full" pendingText="Creating order…">{provider === "razorpay" ? "Pay securely with Razorpay" : "Continue to demo payment"}</SubmitButton>
          {provider === "demo" && <p className="text-xs text-muted">Demo mode: no real payment provider is connected.</p>}
        </form>
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl border-2 border-dashed border-[color-mix(in_srgb,var(--warn)_60%,transparent)] p-4">
            <p className="font-display text-sm font-semibold text-warn">DEMO PAYMENT SIMULATOR</p>
            <p className="mt-1 text-sm text-fg-2">No money moves. Choose an outcome — the <b>server</b> generates and signs the payment event and verifies it through the same webhook pipeline used for Razorpay.</p>
          </div>
          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between"><dt className="text-muted">Order</dt><dd className="font-mono text-xs">{state.orderId.slice(0, 8)}…</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Amount</dt><dd className="font-display font-semibold">{formatMoney(state.amountPaise, state.currency)}</dd></div>
          </dl>
          <div className="grid gap-2 sm:grid-cols-3">
            <button type="button" disabled={busy} onClick={() => simulate("success")} className={buttonClass("primary", "md")}>Succeed</button>
            <button type="button" disabled={busy} onClick={() => simulate("failure")} className={buttonClass("outline", "md")}>Fail</button>
            <button type="button" disabled={busy} onClick={() => simulate("cancel")} className={buttonClass("ghost", "md")}>Cancel</button>
          </div>
        </div>
      )}
      {status && <div className="mt-4"><Alert tone={status.tone}>{status.text}</Alert></div>}
    </Card>
  );
}
