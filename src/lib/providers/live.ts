import { env } from "@/lib/env";
import { hmacHex, randomToken, safeEqual } from "@/lib/crypto";

/**
 * Live class adapters.
 *  - zoom: Server-to-Server OAuth for the REST API (create meetings, participant reports,
 *          cloud recordings) + Meeting SDK JWT signatures for in-browser joining.
 *          The SDK secret never leaves the server.
 *  - demo: SIMULATED classroom. Clearly labelled in the UI; it is NOT a video conference.
 */
export interface MeetingInfo {
  meetingId: string;
  meetingUuid?: string;
  joinUrl: string;
  startUrl?: string;
  passcode?: string;
}

let zoomToken: { value: string; exp: number } | null = null;

async function zoomAccessToken(): Promise<string> {
  const e = env();
  if (!e.ZOOM_ACCOUNT_ID || !e.ZOOM_CLIENT_ID || !e.ZOOM_CLIENT_SECRET) throw new Error("Zoom Server-to-Server OAuth is not configured.");
  if (zoomToken && zoomToken.exp > Date.now() + 60_000) return zoomToken.value;
  const res = await fetch(`https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(e.ZOOM_ACCOUNT_ID)}`, {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${e.ZOOM_CLIENT_ID}:${e.ZOOM_CLIENT_SECRET}`).toString("base64")}` },
    cache: "no-store",
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Zoom OAuth failed: ${data?.reason || res.status}`);
  zoomToken = { value: data.access_token, exp: Date.now() + data.expires_in * 1000 };
  return zoomToken.value;
}

async function zoomApi(path: string, init: RequestInit = {}) {
  const res = await fetch(`https://api.zoom.us/v2${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${await zoomAccessToken()}`, "Content-Type": "application/json", ...(init.headers || {}) },
    cache: "no-store",
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Zoom ${path}: ${data?.message || res.status}`);
  return data;
}

export async function createMeeting(input: { topic: string; startsAt: Date; durationMinutes: number; autoRecord: boolean }): Promise<MeetingInfo> {
  if (env().LIVE_PROVIDER !== "zoom") {
    const id = `demo-${randomToken(6)}`;
    return { meetingId: id, joinUrl: "", passcode: undefined };
  }
  const m = await zoomApi("/users/me/meetings", {
    method: "POST",
    body: JSON.stringify({
      topic: input.topic.slice(0, 200),
      type: 2,
      start_time: input.startsAt.toISOString(),
      duration: input.durationMinutes,
      timezone: "Asia/Kolkata",
      settings: {
        join_before_host: false,
        waiting_room: true,
        mute_upon_entry: true,
        approval_type: 2,
        auto_recording: input.autoRecord ? "cloud" : "none",
        meeting_authentication: false,
      },
    }),
  });
  return { meetingId: String(m.id), meetingUuid: m.uuid, joinUrl: m.join_url, startUrl: m.start_url, passcode: m.password };
}

/** Meeting SDK signature (role 0 = attendee, 1 = host). Valid for 2 hours. */
export function meetingSdkSignature(meetingNumber: string, role: 0 | 1): { signature: string; sdkKey: string } {
  const e = env();
  if (!e.ZOOM_MEETING_SDK_KEY || !e.ZOOM_MEETING_SDK_SECRET) throw new Error("Zoom Meeting SDK credentials are not configured.");
  const iat = Math.floor(Date.now() / 1000) - 30;
  const exp = iat + 60 * 60 * 2;
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const header = b64({ alg: "HS256", typ: "JWT" });
  const payload = b64({ appKey: e.ZOOM_MEETING_SDK_KEY, sdkKey: e.ZOOM_MEETING_SDK_KEY, mn: meetingNumber, role, iat, exp, tokenExp: exp });
  const sig = Buffer.from(hmacHex(e.ZOOM_MEETING_SDK_SECRET, `${header}.${payload}`), "hex").toString("base64url");
  return { signature: `${header}.${payload}.${sig}`, sdkKey: e.ZOOM_MEETING_SDK_KEY };
}

export interface ParticipantRecord {
  email: string | null;
  name: string;
  joinTime: string;
  leaveTime: string | null;
  durationSeconds: number;
}

/** Requires a Pro+ Zoom account (report:read scope). */
export async function fetchParticipants(meetingUuidOrId: string): Promise<ParticipantRecord[]> {
  const id = encodeURIComponent(encodeURIComponent(meetingUuidOrId));
  const out: ParticipantRecord[] = [];
  let next = "";
  do {
    const data = await zoomApi(`/report/meetings/${id}/participants?page_size=300${next ? `&next_page_token=${next}` : ""}`);
    for (const p of data?.participants ?? [])
      out.push({ email: p.user_email || null, name: p.name, joinTime: p.join_time, leaveTime: p.leave_time ?? null, durationSeconds: p.duration ?? 0 });
    next = data?.next_page_token ?? "";
  } while (next);
  return out;
}

export async function fetchRecordings(meetingUuidOrId: string) {
  const id = encodeURIComponent(encodeURIComponent(meetingUuidOrId));
  const data = await zoomApi(`/meetings/${id}/recordings`);
  return (data?.recording_files ?? []).filter((f: { file_type: string }) => f.file_type === "MP4") as {
    id: string; download_url: string; recording_start: string; recording_end: string; file_size: number;
  }[];
}

/** Zoom webhook verification: x-zm-signature = v0=HMAC(secret, "v0:{ts}:{body}") */
export function verifyZoomWebhook(rawBody: string, timestamp: string | null, signature: string | null): boolean {
  const secret = env().ZOOM_WEBHOOK_SECRET_TOKEN;
  if (!secret || !timestamp || !signature) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  return safeEqual(`v0=${hmacHex(secret, `v0:${timestamp}:${rawBody}`)}`, signature);
}

export const liveProviderName = () => env().LIVE_PROVIDER;
