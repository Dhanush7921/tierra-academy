import { z } from "zod";
import { asService, asUser } from "@/lib/db/client";
import { guard, json, apiError } from "@/lib/api";
import { getCloudflareStatus } from "@/lib/providers/video";

/** Polled by the uploader UI. Refreshes Cloudflare processing state. Also lets the uploader save the real duration. */
export async function GET(req: Request, { params }: { params: Promise<{ assetId: string }> }) {
  const g = await guard(req, { permission: "media.upload" });
  if (g.error) return g.error;
  const { assetId } = await params;
  const [a] = await asUser(g.user, (tx) => tx`select id, provider, provider_uid, status, duration_seconds, error_message from public.video_assets where id = ${assetId}`);
  if (!a) return apiError(404, "Not found");
  if (a.provider === "cloudflare" && ["UPLOADING", "PROCESSING"].includes(a.status as string)) {
    const s = await getCloudflareStatus(a.provider_uid as string).catch(() => null);
    if (s) {
      await asService((tx) => tx`update public.video_assets set status = ${s.status}, duration_seconds = coalesce(${s.durationSeconds}, duration_seconds), thumbnail_url = coalesce(${s.thumbnailUrl}, thumbnail_url), error_message = ${s.error} where id = ${assetId}`);
      return json({ ...a, status: s.status, duration_seconds: s.durationSeconds });
    }
  }
  return json(a);
}

const patch = z.object({ durationSeconds: z.number().int().min(1).max(86400) });
export async function PATCH(req: Request, { params }: { params: Promise<{ assetId: string }> }) {
  const g = await guard(req, { permission: "media.upload" });
  if (g.error) return g.error;
  const { assetId } = await params;
  const p = patch.safeParse(await req.json().catch(() => null));
  if (!p.success) return apiError(400, "Invalid duration");
  const rows = await asUser(g.user, (tx) => tx`update public.video_assets set duration_seconds = ${p.data.durationSeconds} where id = ${assetId} and duration_seconds is null returning id`);
  return json({ ok: rows.length > 0 });
}
