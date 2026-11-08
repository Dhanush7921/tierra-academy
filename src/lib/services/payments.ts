import { asService, asUser, type Tx } from "@/lib/db/client";
import { env } from "@/lib/env";
import { randomCode } from "@/lib/crypto";
import {
  DemoPaymentProvider, RazorpayProvider, paymentProvider, verifyRazorpayCheckoutSignature,
  type NormalizedPaymentEvent, type ProviderName,
} from "@/lib/providers/payments";
import { applyTax, quote, type CouponRow } from "@/lib/services/pricing";
import { checkoutReadiness, listOptions } from "@/lib/services/price-options";
import { eligibilityError, grantEnrollment, loadEligibility, type EligibilityCourse } from "@/lib/services/enrollment";
import { audit } from "@/lib/services/audit";
import { notify } from "@/lib/services/notifications";

export type CheckoutResult =
  | { ok: true; orderId: string; provider: ProviderName | "none"; providerOrderId: string | null; amountPaise: number; currency: string; fulfilled: boolean; keyId?: string }
  | { ok: false; error: string; alreadyEnrolled?: boolean };

/**
 * Creates an order for a paid course. The amount is computed on the server from the DB
 * price and a validated coupon — never from client input.
 */
export async function createCheckout(user: { id: string; email: string }, courseId: string, couponCode?: string | null, optionId?: string | null): Promise<CheckoutResult> {
  const visible = await asUser(user, (tx) => tx`select id from public.courses where id = ${courseId}`);
  if (!visible[0]) return { ok: false, error: "Course not found." };

  const prepared = await asService(async (tx) => {
    const el = await loadEligibility(tx, courseId);
    if (!el) return { ok: false as const, error: "Course not found." };
    const [already] = await tx`select status from public.enrollments where user_id = ${user.id} and course_id = ${courseId}`;
    if (already && ["ACTIVE", "COMPLETED"].includes(already.status as string)) return { ok: false as const, error: "You are already enrolled.", alreadyEnrolled: true };
    const err = eligibilityError(el.course as unknown as EligibilityCourse, el.activeCount);
    if (err) return { ok: false as const, error: err };
    if (el.course.is_free) return { ok: false as const, error: "This course is free — enroll directly." };
    const readiness = await checkoutReadiness(tx);
    if (!readiness.ready) return { ok: false as const, error: "Enrollment for this course opens soon. Online payment is not available yet." };
    const provider = paymentProvider();
    const options = await listOptions(tx, courseId);
    const option = options.length ? options.find((o) => o.id === optionId) : null;
    if (options.length && !option) return { ok: false as const, error: "Please choose a training duration." };

    let coupon: CouponRow | null = null;
    if (couponCode?.trim()) {
      const [c] = await tx`select * from public.coupons where code = ${couponCode.trim()}`;
      if (!c) return { ok: false as const, error: "Coupon not found." };
      coupon = c as unknown as CouponRow;
    }
    const base = quote({ id: courseId, is_free: el.course.is_free as boolean, price_paise: option ? option.price_paise : (el.course.price_paise as number) }, coupon);
    if (!base.ok) return { ok: false as const, error: base.error };
    const q = applyTax(base, readiness.tax.rateBp);
    const snapshot = { courseTitle: el.course.title, option: option ? { id: option.id, label: option.label, durationDays: option.duration_days, pricePaise: option.price_paise } : null,
      subtotal: q.subtotal, discount: q.discount, net: q.net, tax: { label: readiness.tax.label, rateBp: readiness.tax.rateBp, amount: q.tax }, total: q.payable, coupon: couponCode ?? null, at: new Date().toISOString() };

    const receipt = `TA-${Date.now().toString(36).toUpperCase()}-${randomCode(5)}`;
    const [order] = await tx`
      insert into public.orders (user_id, course_id, status, provider, subtotal_paise, discount_paise, amount_paise, currency, coupon_id, receipt,
                                 price_option_id, option_label, duration_days, tax_label, tax_rate_bp, tax_paise, pricing_snapshot)
      values (${user.id}, ${courseId}, 'CREATED', ${q.payable === 0 ? "none" : provider.name}, ${q.subtotal}, ${q.discount}, ${q.payable},
              ${el.course.currency as string}, ${q.couponId}, ${receipt}, ${option?.id ?? null}, ${option?.label ?? null}, ${option?.duration_days ?? null},
              ${readiness.tax.label}, ${readiness.tax.rateBp}, ${q.tax}, ${tx.json(snapshot as never)})
      returning id`;
    await audit({ actorId: user.id, action: "order.create", entityType: "order", entityId: order.id as string, metadata: { courseId, option: option?.label ?? null, amount: q.payable, tax: q.tax, coupon: couponCode ?? null } }, tx);
    return { ok: true as const, orderId: order.id as string, amount: q.payable, currency: el.course.currency as string, receipt, title: el.course.title as string };
  });
  if (!prepared.ok) return prepared;

  // 100% discount: fulfil server-side without a payment provider.
  if (prepared.amount === 0) {
    await asService((tx) => fulfilOrder(tx, prepared.orderId, { source: "COUPON" }));
    return { ok: true, orderId: prepared.orderId, provider: "none", providerOrderId: null, amountPaise: 0, currency: prepared.currency, fulfilled: true };
  }

  const pv = paymentProvider();
  const created = await pv.createOrder({
    amountPaise: prepared.amount, currency: prepared.currency, receipt: prepared.receipt,
    notes: { orderId: prepared.orderId, courseId, userId: user.id },
  });
  await asService((tx) => tx`update public.orders set provider_order_id = ${created.providerOrderId}, status = 'PENDING' where id = ${prepared.orderId}`);
  return {
    ok: true, orderId: prepared.orderId, provider: pv.name, providerOrderId: created.providerOrderId,
    amountPaise: prepared.amount, currency: prepared.currency, fulfilled: false,
    keyId: pv.name === "razorpay" ? env().RAZORPAY_KEY_ID : undefined,
  };
}

/** Marks an order PAID and unlocks the course. Idempotent. Runs inside the caller's transaction. */
async function fulfilOrder(tx: Tx, orderId: string, opts: { source: "PURCHASE" | "COUPON" }) {
  const [o] = await tx`select * from public.orders where id = ${orderId} for update`;
  if (!o) throw new Error(`order ${orderId} not found`);
  if (o.status === "PAID") return { alreadyPaid: true };
  if (["REFUNDED", "PARTIALLY_REFUNDED"].includes(o.status as string)) return { alreadyPaid: true };
  await tx`update public.orders set status = 'PAID', paid_at = now() where id = ${orderId}`;
  if (o.coupon_id) await tx`update public.coupons set redeemed_count = redeemed_count + 1 where id = ${o.coupon_id}`;
  const [c] = await tx`select title, access_days from public.courses where id = ${o.course_id}`;
  await grantEnrollment(tx, { userId: o.user_id as string, courseId: o.course_id as string, source: opts.source, orderId, accessDays: c.access_days as number | null });
  await audit({ actorId: o.user_id as string, action: "order.paid", entityType: "order", entityId: orderId, metadata: { amount: o.amount_paise, source: opts.source } }, tx);
  await notify(o.user_id as string, { kind: "PAYMENT", title: `Payment confirmed — ${c.title}`, body: "Your course is now unlocked. Happy building!", link: "/dashboard/courses", email: true }, tx);
  return { alreadyPaid: false };
}

export type WebhookOutcome = { status: 200 | 400; body: string };

/**
 * Verified, idempotent webhook processing shared by Razorpay and the demo simulator.
 *  1. verify HMAC signature over the RAW body  → 400 if invalid
 *  2. record (provider, event_id) in webhook_events → duplicate deliveries are acknowledged and skipped
 *  3. apply the state change in one transaction, validating amount and currency against the order
 */
export async function processPaymentWebhook(providerName: ProviderName, rawBody: string, signature: string | null, eventIdHeader: string | null): Promise<WebhookOutcome> {
  const e = env();
  // verification needs only the webhook secret; an unconfigured provider can never produce a valid signature
  const provider = providerName === "demo"
    ? new DemoPaymentProvider(e.DEMO_PAYMENT_WEBHOOK_SECRET)
    : new RazorpayProvider(e.RAZORPAY_KEY_ID, e.RAZORPAY_KEY_SECRET, e.RAZORPAY_WEBHOOK_SECRET);
  if (!provider.verifyWebhookSignature(rawBody, signature)) return { status: 400, body: "invalid signature" };
  let evt: NormalizedPaymentEvent;
  try {
    evt = provider.parseWebhook(rawBody, eventIdHeader);
  } catch {
    return { status: 400, body: "invalid payload" };
  }
  return asService(async (tx) => {
    const inserted = await tx`insert into public.webhook_events (provider, event_id, event_type, payload)
                              values (${providerName}, ${evt.eventId}, ${evt.type}, ${tx.json(evt.raw as never)})
                              on conflict (provider, event_id) do nothing returning id`;
    if (!inserted[0]) return { status: 200 as const, body: "duplicate" };
    const eventRowId = inserted[0].id;
    const result = await applyEvent(tx, providerName, evt);
    await tx`update public.webhook_events set processed_at = now(), error = ${result === "ok" ? null : result} where id = ${eventRowId}`;
    return { status: 200 as const, body: result };
  });
}

async function applyEvent(tx: Tx, provider: ProviderName, evt: NormalizedPaymentEvent): Promise<string> {
  if (evt.type === "ignored") return "ignored";
  if (evt.type === "payment.captured" || evt.type === "payment.failed") {
    if (!evt.providerOrderId || !evt.providerPaymentId) return "missing ids";
    const [o] = await tx`select * from public.orders where provider = ${provider} and provider_order_id = ${evt.providerOrderId} for update`;
    if (!o) return "unknown order";
    if (evt.type === "payment.captured") {
      if (evt.amountPaise !== o.amount_paise || (evt.currency && evt.currency !== o.currency)) {
        await audit({ actorId: null, action: "payment.amount_mismatch", entityType: "order", entityId: o.id as string, metadata: { expected: o.amount_paise, got: evt.amountPaise } }, tx);
        return "amount mismatch";
      }
      await tx`insert into public.payments (order_id, user_id, provider, provider_payment_id, status, amount_paise, currency, method, raw)
               values (${o.id}, ${o.user_id}, ${provider}, ${evt.providerPaymentId}, 'CAPTURED', ${evt.amountPaise}, ${o.currency}, ${evt.method ?? null}, ${tx.json(evt.raw as never)})
               on conflict (provider, provider_payment_id) do update set status = 'CAPTURED', updated_at = now()`;
      await fulfilOrder(tx, o.id as string, { source: "PURCHASE" });
      return "ok";
    }
    await tx`insert into public.payments (order_id, user_id, provider, provider_payment_id, status, amount_paise, currency, failure_reason, raw)
             values (${o.id}, ${o.user_id}, ${provider}, ${evt.providerPaymentId}, 'FAILED', ${evt.amountPaise ?? o.amount_paise}, ${o.currency}, ${evt.failureReason ?? null}, ${tx.json(evt.raw as never)})
             on conflict (provider, provider_payment_id) do nothing`;
    if (o.status !== "PAID") await tx`update public.orders set status = 'FAILED' where id = ${o.id}`;
    await notify(o.user_id as string, { kind: "PAYMENT", title: "Payment failed", body: evt.failureReason ?? "Your payment could not be completed. You can retry from the course page.", link: "/dashboard/payments" }, tx);
    return "ok";
  }
  if (evt.type === "refund.processed" || evt.type === "refund.failed") {
    if (!evt.providerRefundId) return "missing refund id";
    const [r] = await tx`select * from public.refunds where provider_refund_id = ${evt.providerRefundId} for update`;
    if (!r) return "unknown refund";
    if (evt.type === "refund.failed") {
      await tx`update public.refunds set status = 'FAILED' where id = ${r.id}`;
      return "ok";
    }
    await completeRefund(tx, r.id as string);
    return "ok";
  }
  return "ignored";
}

async function completeRefund(tx: Tx, refundId: string) {
  const [r] = await tx`update public.refunds set status = 'PROCESSED', processed_at = coalesce(processed_at, now())
                       where id = ${refundId} and status <> 'PROCESSED' returning *`;
  if (!r) return;
  const [o] = await tx`select amount_paise, course_id, user_id from public.orders where id = ${r.order_id}`;
  const full = (r.amount_paise as number) >= (o.amount_paise as number);
  await tx`update public.orders set status = ${full ? "REFUNDED" : "PARTIALLY_REFUNDED"} where id = ${r.order_id}`;
  if (r.payment_id) await tx`update public.payments set status = ${full ? "REFUNDED" : "PARTIALLY_REFUNDED"} where id = ${r.payment_id}`;
  if (full) await tx`update public.enrollments set status = 'REFUNDED' where user_id = ${o.user_id} and course_id = ${o.course_id} and order_id = ${r.order_id}`;
  await notify(o.user_id as string, { kind: "PAYMENT", title: "Refund processed", body: `A refund of ₹${((r.amount_paise as number) / 100).toFixed(2)} has been processed.`, link: "/dashboard/payments", email: true }, tx);
}

/**
 * Razorpay Checkout success handler: verifies the HMAC signature AND re-fetches the payment
 * from Razorpay before fulfilling (the webhook will also arrive; both paths are idempotent).
 */
export async function verifyRazorpayCheckout(user: { id: string }, input: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) {
  const e = env();
  if (!verifyRazorpayCheckoutSignature(input.razorpay_order_id, input.razorpay_payment_id, input.razorpay_signature, e.RAZORPAY_KEY_SECRET))
    return { ok: false as const, error: "Payment signature verification failed." };
  const provider = paymentProvider("razorpay") as RazorpayProvider;
  const p = await provider.fetchPayment(input.razorpay_payment_id);
  if (p.order_id !== input.razorpay_order_id || !["captured", "authorized"].includes(p.status))
    return { ok: false as const, error: "Payment is not captured yet. We'll unlock the course as soon as Razorpay confirms it." };
  return asService(async (tx) => {
    const [o] = await tx`select * from public.orders where provider = 'razorpay' and provider_order_id = ${input.razorpay_order_id} and user_id = ${user.id} for update`;
    if (!o) return { ok: false as const, error: "Order not found." };
    if (p.amount !== o.amount_paise) return { ok: false as const, error: "Amount mismatch — contact support." };
    if (p.status !== "captured") return { ok: false as const, error: "Payment authorised but not yet captured." };
    await tx`insert into public.payments (order_id, user_id, provider, provider_payment_id, status, amount_paise, currency, method, raw)
             values (${o.id}, ${user.id}, 'razorpay', ${p.id}, 'CAPTURED', ${p.amount}, ${o.currency}, ${p.method ?? null}, ${tx.json(p)})
             on conflict (provider, provider_payment_id) do nothing`;
    await fulfilOrder(tx, o.id as string, { source: "PURCHASE" });
    return { ok: true as const, orderId: o.id as string };
  });
}

/**
 * DEMO MODE ONLY. The student picks an outcome; the SERVER builds and signs a Razorpay-shaped
 * event and feeds it through the same verified webhook pipeline. No real money moves.
 */
export async function simulateDemoPayment(user: { id: string }, orderId: string, outcome: "success" | "failure" | "cancel") {
  if (env().PAYMENTS_PROVIDER !== "demo") return { ok: false as const, error: "Demo payments are disabled." };
  const [o] = await asService((tx) => tx`select * from public.orders where id = ${orderId} and user_id = ${user.id}`);
  if (!o || o.provider !== "demo") return { ok: false as const, error: "Order not found." };
  if (o.status === "PAID") return { ok: true as const, status: "PAID" };
  if (outcome === "cancel") {
    await asService((tx) => tx`update public.orders set status = 'CANCELLED' where id = ${orderId} and status in ('CREATED','PENDING')`);
    return { ok: true as const, status: "CANCELLED" };
  }
  const demo = new DemoPaymentProvider(env().DEMO_PAYMENT_WEBHOOK_SECRET);
  const evt = demo.buildSignedEvent(outcome === "success" ? "payment.captured" : "payment.failed", {
    id: `demo_pay_${randomCode(12)}`, order_id: o.provider_order_id, amount: o.amount_paise, currency: o.currency,
    status: outcome === "success" ? "captured" : "failed", method: "demo",
    ...(outcome === "failure" ? { error_description: "Simulated failure (demo mode)." } : {}),
  });
  const res = await processPaymentWebhook("demo", evt.raw, evt.signature, evt.eventId);
  const [after] = await asService((tx) => tx`select status from public.orders where id = ${orderId}`);
  return { ok: res.status === 200, status: after.status as string };
}

// ── refunds ────────────────────────────────────────────────────────────────
export const REFUND_WINDOW_DAYS = 7;

export async function requestRefund(user: { id: string }, orderId: string, reason: string) {
  return asService(async (tx) => {
    const [o] = await tx`select * from public.orders where id = ${orderId} and user_id = ${user.id} for update`;
    if (!o || o.status !== "PAID") return { ok: false as const, error: "Only paid orders can be refunded." };
    if ((o.amount_paise as number) === 0) return { ok: false as const, error: "Fully discounted orders have nothing to refund." };
    if (Date.now() - new Date(o.paid_at as string).getTime() > REFUND_WINDOW_DAYS * 86400_000)
      return { ok: false as const, error: `Refund requests must be made within ${REFUND_WINDOW_DAYS} days of purchase (see Refund Policy).` };
    const open = await tx`select id from public.refunds where order_id = ${orderId} and status in ('REQUESTED','APPROVED','PROCESSING')`;
    if (open[0]) return { ok: false as const, error: "A refund request for this order is already open." };
    const [p] = await tx`select id from public.payments where order_id = ${orderId} and status = 'CAPTURED' limit 1`;
    const [r] = await tx`insert into public.refunds (order_id, payment_id, user_id, amount_paise, reason, requested_by)
                         values (${orderId}, ${p?.id ?? null}, ${user.id}, ${o.amount_paise}, ${reason.slice(0, 1000)}, ${user.id}) returning id`;
    await audit({ actorId: user.id, action: "refund.request", entityType: "refund", entityId: r.id as string }, tx);
    return { ok: true as const, refundId: r.id as string };
  });
}

/** Super Admin decision. Approval triggers the provider refund. */
export async function decideRefund(admin: { id: string }, refundId: string, approve: boolean, note: string, amountPaise?: number) {
  const prep = await asService(async (tx) => {
    const [r] = await tx`select r.*, p.provider, p.provider_payment_id from public.refunds r
                         left join public.payments p on p.id = r.payment_id where r.id = ${refundId} for update of r`;
    if (!r || !["REQUESTED", "APPROVED", "FAILED"].includes(r.status as string)) return { ok: false as const, error: "Refund is not pending." };
    if (!approve) {
      await tx`update public.refunds set status = 'REJECTED', decided_by = ${admin.id}, decision_note = ${note} where id = ${refundId}`;
      await audit({ actorId: admin.id, actorRole: "SUPER_ADMIN", action: "refund.reject", entityType: "refund", entityId: refundId, metadata: { note } }, tx);
      await notify(r.user_id as string, { kind: "PAYMENT", title: "Refund request declined", body: note || "See the refund policy for details.", link: "/dashboard/payments" }, tx);
      return { ok: true as const, done: true };
    }
    const amount = Math.min(amountPaise ?? (r.amount_paise as number), r.amount_paise as number);
    await tx`update public.refunds set status = 'PROCESSING', amount_paise = ${amount}, decided_by = ${admin.id}, decision_note = ${note} where id = ${refundId}`;
    return { ok: true as const, done: false, provider: r.provider as ProviderName, providerPaymentId: r.provider_payment_id as string, amount, orderId: r.order_id as string };
  });
  if (!prep.ok || prep.done) return prep;
  if (!("providerPaymentId" in prep) || !prep.providerPaymentId) return { ok: false as const, error: "No captured payment found for this order." };
  try {
    const provider = paymentProvider(prep.provider);
    const res = await provider.refund(prep.providerPaymentId, prep.amount!, { refundId, orderId: prep.orderId! });
    await asService(async (tx) => {
      // stays PROCESSING until completeRefund() (immediately for instant refunds, or via the refund.processed webhook)
      await tx`update public.refunds set provider_refund_id = ${res.providerRefundId}, status = 'PROCESSING' where id = ${refundId}`;
      if (res.status === "PROCESSED") await completeRefund(tx, refundId);
      await audit({ actorId: admin.id, actorRole: "SUPER_ADMIN", action: "refund.approve", entityType: "refund", entityId: refundId, metadata: { amount: prep.amount, providerRefundId: res.providerRefundId } }, tx);
    });
    return { ok: true as const, done: true };
  } catch (e) {
    await asService((tx) => tx`update public.refunds set status = 'FAILED', decision_note = ${String(e).slice(0, 400)} where id = ${refundId}`);
    return { ok: false as const, error: `Refund failed at the payment provider: ${String(e)}` };
  }
}
