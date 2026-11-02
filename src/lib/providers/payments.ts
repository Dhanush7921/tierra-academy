import { env } from "@/lib/env";
import { hmacHex, randomToken, safeEqual } from "@/lib/crypto";

/**
 * Payment provider adapters.
 *  - "razorpay": real Razorpay Orders/Payments/Refunds REST API + HMAC signatures.
 *  - "demo":     SIMULATED provider. No money moves. Events are generated and signed on the
 *                SERVER with DEMO_PAYMENT_WEBHOOK_SECRET and processed by the same verified
 *                webhook pipeline as Razorpay — the browser never grants access.
 */
export type ProviderName = "demo" | "razorpay";

export interface CreatedOrder {
  providerOrderId: string;
}

export interface NormalizedPaymentEvent {
  eventId: string;
  type: "payment.captured" | "payment.failed" | "refund.processed" | "refund.failed" | "ignored";
  providerOrderId?: string;
  providerPaymentId?: string;
  providerRefundId?: string;
  amountPaise?: number;
  currency?: string;
  method?: string;
  failureReason?: string;
  raw: unknown;
}

export interface PaymentProvider {
  name: ProviderName;
  createOrder(input: { amountPaise: number; currency: string; receipt: string; notes: Record<string, string> }): Promise<CreatedOrder>;
  verifyWebhookSignature(rawBody: string, signature: string | null): boolean;
  parseWebhook(rawBody: string, eventIdHeader: string | null): NormalizedPaymentEvent;
  refund(providerPaymentId: string, amountPaise: number, notes: Record<string, string>): Promise<{ providerRefundId: string; status: "PROCESSED" | "PROCESSING" }>;
}

// ── Razorpay webhook/event normalisation (shared with demo, which mimics its format) ──
function normalizeRazorpayEvent(body: Record<string, any>, eventId: string): NormalizedPaymentEvent {
  const payment = body?.payload?.payment?.entity;
  const refund = body?.payload?.refund?.entity;
  switch (body?.event) {
    case "payment.captured":
    case "order.paid":
      return {
        eventId, type: "payment.captured", raw: body,
        providerOrderId: payment?.order_id, providerPaymentId: payment?.id,
        amountPaise: payment?.amount, currency: payment?.currency, method: payment?.method,
      };
    case "payment.failed":
      return {
        eventId, type: "payment.failed", raw: body,
        providerOrderId: payment?.order_id, providerPaymentId: payment?.id,
        amountPaise: payment?.amount, currency: payment?.currency,
        failureReason: payment?.error_description || payment?.error_reason || "Payment failed",
      };
    case "refund.processed":
      return { eventId, type: "refund.processed", raw: body, providerRefundId: refund?.id, providerPaymentId: refund?.payment_id, amountPaise: refund?.amount };
    case "refund.failed":
      return { eventId, type: "refund.failed", raw: body, providerRefundId: refund?.id, providerPaymentId: refund?.payment_id };
    default:
      return { eventId, type: "ignored", raw: body };
  }
}

/** Razorpay Checkout handler signature: HMAC_SHA256(order_id + "|" + payment_id, key_secret) */
export function verifyRazorpayCheckoutSignature(orderId: string, paymentId: string, signature: string, keySecret: string): boolean {
  return safeEqual(hmacHex(keySecret, `${orderId}|${paymentId}`), signature);
}

export class RazorpayProvider implements PaymentProvider {
  name = "razorpay" as const;
  constructor(private keyId: string, private keySecret: string, private webhookSecret: string) {}

  private async api(path: string, body?: unknown, method = "POST") {
    const res = await fetch(`https://api.razorpay.com/v1${path}`, {
      method,
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.keyId}:${this.keySecret}`).toString("base64")}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Razorpay ${path}: ${data?.error?.description || res.status}`);
    return data;
  }

  async createOrder(input: { amountPaise: number; currency: string; receipt: string; notes: Record<string, string> }) {
    const o = await this.api("/orders", { amount: input.amountPaise, currency: input.currency, receipt: input.receipt, notes: input.notes });
    return { providerOrderId: o.id as string };
  }

  async fetchPayment(paymentId: string) {
    return this.api(`/payments/${encodeURIComponent(paymentId)}`, undefined, "GET");
  }

  verifyWebhookSignature(rawBody: string, signature: string | null) {
    if (!signature || !this.webhookSecret) return false;
    return safeEqual(hmacHex(this.webhookSecret, rawBody), signature);
  }

  parseWebhook(rawBody: string, eventIdHeader: string | null) {
    const body = JSON.parse(rawBody);
    return normalizeRazorpayEvent(body, eventIdHeader || `${body.event}:${body.payload?.payment?.entity?.id ?? body.payload?.refund?.entity?.id ?? body.created_at}`);
  }

  async refund(providerPaymentId: string, amountPaise: number, notes: Record<string, string>) {
    const r = await this.api(`/payments/${encodeURIComponent(providerPaymentId)}/refund`, { amount: amountPaise, speed: "normal", notes });
    return { providerRefundId: r.id as string, status: (r.status === "processed" ? "PROCESSED" : "PROCESSING") as "PROCESSED" | "PROCESSING" };
  }
}

export class DemoPaymentProvider implements PaymentProvider {
  name = "demo" as const;
  constructor(private secret: string) {}

  async createOrder() {
    return { providerOrderId: `demo_order_${randomToken(12)}` };
  }

  /** Server-side only: builds a Razorpay-shaped event and signs it. */
  buildSignedEvent(event: "payment.captured" | "payment.failed" | "refund.processed", entity: Record<string, unknown>) {
    const body = {
      entity: "event",
      event,
      demo: true,
      created_at: Math.floor(Date.now() / 1000),
      payload: event === "refund.processed" ? { refund: { entity } } : { payment: { entity } },
    };
    const raw = JSON.stringify(body);
    return { raw, signature: hmacHex(this.secret, raw), eventId: `demo_evt_${randomToken(12)}` };
  }

  verifyWebhookSignature(rawBody: string, signature: string | null) {
    return Boolean(signature) && safeEqual(hmacHex(this.secret, rawBody), signature!);
  }

  parseWebhook(rawBody: string, eventIdHeader: string | null) {
    const body = JSON.parse(rawBody);
    return normalizeRazorpayEvent(body, eventIdHeader || `demo:${body.created_at}:${randomToken(6)}`);
  }

  async refund() {
    return { providerRefundId: `demo_rfnd_${randomToken(12)}`, status: "PROCESSED" as const };
  }
}

export function paymentProvider(name?: ProviderName): PaymentProvider {
  const e = env();
  const which = name ?? e.PAYMENTS_PROVIDER;
  if (which === "razorpay") {
    if (!e.RAZORPAY_KEY_ID || !e.RAZORPAY_KEY_SECRET) throw new Error("Razorpay is not configured (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET).");
    return new RazorpayProvider(e.RAZORPAY_KEY_ID, e.RAZORPAY_KEY_SECRET, e.RAZORPAY_WEBHOOK_SECRET);
  }
  if (e.APP_MODE === "production" && e.NODE_ENV === "production") throw new Error("Demo payments are disabled in production mode.");
  return new DemoPaymentProvider(e.DEMO_PAYMENT_WEBHOOK_SECRET);
}
