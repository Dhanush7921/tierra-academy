import { env } from "@/lib/env";
import { asService } from "@/lib/db/client";
import { apiError, json, reportError } from "@/lib/api";
import { safeEqual } from "@/lib/crypto";
import { getCloudflareStatus } from "@/lib/providers/video";
import { syncZoomAttendance } from "@/lib/services/live";

/** Hourly housekeeping: close stale sessions, refresh processing videos, import Zoom attendance, prune old webhook payloads. */
export async function GET(req: Request) {
  const secret = env().CRON_SECRET;
  if (!secret || !safeEqual(req.headers.get("authorization") ?? "", `Bearer ${secret}`)) return apiError(401, "unauthorised");
  const out: Record<string, number> = {};
  const ended = await asService((tx) => tx`update public.live_sessions set status = 'ENDED'
    where status in ('SCHEDULED','LIVE') and starts_at + make_interval(mins => duration_minutes + 120) < now() returning id, provider`);
  out.sessionsClosed = ended.length;
  if (env().LIVE_PROVIDER === "zoom") for (const s of ended.filter((x) => x.provider === "zoom")) await syncZoomAttendance(s.id as string).catch((e) => reportError("cron-zoom", e));
  if (env().VIDEO_PROVIDER === "cloudflare") {
    const vids = await asService((tx) => tx`select id, provider_uid from public.video_assets where provider = 'cloudflare' and status in ('UPLOADING','PROCESSING') limit 50`);
    for (const v of vids) {
      const s = await getCloudflareStatus(v.provider_uid as string).catch(() => null);
      if (s) await asService((tx) => tx`update public.video_assets set status = ${s.status}, duration_seconds = coalesce(${s.durationSeconds}, duration_seconds) where id = ${v.id}`);
    }
    out.videosChecked = vids.length;
  }
  const pruned = await asService((tx) => tx`update public.webhook_events set payload = '{}'::jsonb where received_at < now() - interval '90 days' and payload <> '{}'::jsonb returning id`);
  out.webhookPayloadsPruned = pruned.length;
  return json(out);
}
