import { asService } from "@/lib/db/client";
import { apiError, json } from "@/lib/api";
import { env } from "@/lib/env";
import { hmacHex } from "@/lib/crypto";
import { verifyZoomWebhook } from "@/lib/providers/live";
import { syncZoomAttendance } from "@/lib/services/live";

/** Zoom webhooks: URL validation, meeting.started/ended, recording.completed. */
export async function POST(req: Request) {
  const raw = await req.text();
  const body = JSON.parse(raw || "{}");
  if (body.event === "endpoint.url_validation") {
    const token = body.payload?.plainToken ?? "";
    return json({ plainToken: token, encryptedToken: hmacHex(env().ZOOM_WEBHOOK_SECRET_TOKEN, token) });
  }
  if (!verifyZoomWebhook(raw, req.headers.get("x-zm-request-timestamp"), req.headers.get("x-zm-signature"))) return apiError(400, "invalid signature");
  const meetingId = String(body.payload?.object?.id ?? "");
  const [s] = await asService((tx) => tx`select live_session_id from public.live_session_secrets where meeting_id = ${meetingId}`);
  if (!s) return json({ ok: true, ignored: true });
  const sid = s.live_session_id as string;
  switch (body.event) {
    case "meeting.started":
      await asService((tx) => tx`update public.live_sessions set status = 'LIVE' where id = ${sid} and status = 'SCHEDULED'`);
      break;
    case "meeting.ended":
      await asService((tx) => tx`update public.live_sessions set status = 'ENDED', recording_status = case when recording_status = 'NONE' then 'PENDING'::public.recording_status else recording_status end where id = ${sid}`);
      await asService((tx) => tx`update public.live_session_secrets set meeting_uuid = coalesce(${body.payload?.object?.uuid ?? null}, meeting_uuid) where live_session_id = ${sid}`);
      await syncZoomAttendance(sid).catch(() => 0);
      break;
    case "recording.completed":
      await asService((tx) => tx`update public.live_sessions set recording_status = 'READY' where id = ${sid}`);
      break;
  }
  return json({ ok: true });
}
