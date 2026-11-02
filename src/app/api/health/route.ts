import { sql } from "@/lib/db/client";
import { env } from "@/lib/env";
import { json } from "@/lib/api";

export const dynamic = "force-dynamic";

/** Liveness + DB connectivity + configured provider modes (no secrets). */
export async function GET() {
  const t = Date.now();
  let db = "ok";
  try { await sql()`select 1`; } catch { db = "error"; }
  const e = env();
  return json({
    status: db === "ok" ? "ok" : "degraded", dbLatencyMs: Date.now() - t, mode: e.APP_MODE,
    providers: { auth: e.AUTH_PROVIDER, payments: e.PAYMENTS_PROVIDER, live: e.LIVE_PROVIDER, video: e.VIDEO_PROVIDER, email: e.EMAIL_PROVIDER, storage: e.STORAGE_PROVIDER },
  }, db === "ok" ? 200 : 503);
}
