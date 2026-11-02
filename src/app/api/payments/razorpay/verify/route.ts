import { z } from "zod";
import { guard, json, apiError, reportError } from "@/lib/api";
import { verifyRazorpayCheckout } from "@/lib/services/payments";

const body = z.object({ razorpay_order_id: z.string().min(5).max(64), razorpay_payment_id: z.string().min(5).max(64), razorpay_signature: z.string().regex(/^[a-f0-9]{64}$/) });

export async function POST(req: Request) {
  const g = await guard(req, { limit: [20, 600], key: "rzp-verify" });
  if (g.error) return g.error;
  const p = body.safeParse(await req.json().catch(() => null));
  if (!p.success) return apiError(400, "Invalid payment response.");
  try {
    const r = await verifyRazorpayCheckout(g.user, p.data);
    return r.ok ? json(r) : apiError(400, r.error);
  } catch (e) {
    reportError("rzp-verify", e);
    return apiError(502, "Could not reach the payment provider. Your access will unlock automatically once the payment is confirmed.");
  }
}
