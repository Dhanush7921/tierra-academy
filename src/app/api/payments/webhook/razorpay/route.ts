import { apiError, ipLimit, json, reportError } from "@/lib/api";
import { LIMITS } from "@/lib/rate-limit";
import { processPaymentWebhook } from "@/lib/services/payments";

/**
 * Razorpay webhook. Signature is verified over the RAW body; processing is idempotent
 * (webhook_events unique on provider+event id). Always responds quickly with 2xx for
 * duplicates so Razorpay stops retrying.
 */
export async function POST(req: Request) {
  const rl = await ipLimit(req, "rzp-webhook", LIMITS.webhook);
  if (!rl.ok) return apiError(429, "rate limited");
  const raw = await req.text();
  try {
    const r = await processPaymentWebhook("razorpay", raw, req.headers.get("x-razorpay-signature"), req.headers.get("x-razorpay-event-id"));
    return new Response(r.body, { status: r.status });
  } catch (e) {
    reportError("razorpay-webhook", e);
    return json({ error: "processing failed" }, 500); // non-2xx → Razorpay retries later
  }
}
