import { env } from "@/lib/env";
import { apiError, json } from "@/lib/api";
import { safeEqual } from "@/lib/crypto";
import { sendDueReminders } from "@/lib/services/live";

/** Vercel Cron → live class reminders. Authorised with CRON_SECRET (Authorization: Bearer …). */
export async function GET(req: Request) {
  const secret = env().CRON_SECRET;
  if (!secret || !safeEqual(req.headers.get("authorization") ?? "", `Bearer ${secret}`)) return apiError(401, "unauthorised");
  return json(await sendDueReminders());
}
