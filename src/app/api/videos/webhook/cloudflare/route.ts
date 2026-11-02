import { asService } from "@/lib/db/client";
import { apiError, json } from "@/lib/api";
import { verifyCloudflareWebhook } from "@/lib/providers/video";

/** Cloudflare Stream "video ready / error" webhook (signature-verified). */
export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyCloudflareWebhook(raw, req.headers.get("webhook-signature"))) return apiError(400, "invalid signature");
  const v = JSON.parse(raw);
  const state = v?.status?.state;
  const status = state === "ready" ? "READY" : state === "error" ? "ERROR" : "PROCESSING";
  await asService((tx) => tx`update public.video_assets set status = ${status}, duration_seconds = coalesce(${v.duration > 0 ? Math.round(v.duration) : null}, duration_seconds),
                             thumbnail_url = coalesce(${v.thumbnail ?? null}, thumbnail_url), error_message = ${v?.status?.errorReasonText ?? null}
                             where provider = 'cloudflare' and provider_uid = ${v.uid}`);
  return json({ ok: true });
}
