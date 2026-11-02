import { z } from "zod";
import { guard, json, apiError } from "@/lib/api";
import { simulateDemoPayment } from "@/lib/services/payments";

const body = z.object({ orderId: z.string().uuid(), outcome: z.enum(["success", "failure", "cancel"]) });

/** DEMO MODE ONLY — see simulateDemoPayment(): the server signs and verifies the event. */
export async function POST(req: Request) {
  const g = await guard(req, { limit: [20, 600], key: "demo-pay" });
  if (g.error) return g.error;
  const p = body.safeParse(await req.json().catch(() => null));
  if (!p.success) return apiError(400, "Invalid request");
  const r = await simulateDemoPayment(g.user, p.data.orderId, p.data.outcome);
  return r.ok ? json(r) : apiError(400, r.error ?? "Failed");
}
