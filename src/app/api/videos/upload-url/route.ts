import { z } from "zod";
import { asService, asUser } from "@/lib/db/client";
import { guard, json, apiError, reportError } from "@/lib/api";
import { createUploadTicket } from "@/lib/providers/video";
import { audit } from "@/lib/services/audit";

const body = z.object({ courseId: z.string().uuid(), filename: z.string().max(255), sizeBytes: z.number().int().positive().max(4 * 1024 ** 3), lessonId: z.string().uuid().optional() });

/** Authorised Content Manager / Super Admin → creates a video asset row + a direct upload URL. */
export async function POST(req: Request) {
  const g = await guard(req, { permission: "media.upload", limit: [30, 3600], key: "upload-url" });
  if (g.error) return g.error;
  const p = body.safeParse(await req.json().catch(() => null));
  if (!p.success) return apiError(400, "Invalid upload request.");
  if (!/\.(mp4|mov|mkv|webm|m4v)$/i.test(p.data.filename)) return apiError(415, "Upload an MP4, MOV, MKV, M4V or WEBM video.");
  const [ok] = await asUser(g.user, (tx) => tx`select public.manages_course(${p.data.courseId}) as ok`);
  if (!ok.ok) return apiError(403, "You are not assigned to this course.");
  try {
    const provider = process.env.VIDEO_PROVIDER === "cloudflare" ? "cloudflare" : "local";
    const [asset] = await asUser(g.user, (tx) => tx`
      insert into public.video_assets (provider, provider_uid, course_id, status, original_filename, size_bytes, uploaded_by)
      values (${provider}, ${"pending-" + crypto.randomUUID()}, ${p.data.courseId}, 'UPLOADING', ${p.data.filename}, ${p.data.sizeBytes}, ${g.user.id}) returning id`);
    const ticket = await createUploadTicket(asset.id as string, g.user.id);
    await asService((tx) => tx`update public.video_assets set provider_uid = ${ticket.providerUid} where id = ${asset.id}`);
    await audit({ actorId: g.user.id, action: "video.upload_start", entityType: "video_asset", entityId: asset.id as string, metadata: { filename: p.data.filename } });
    return json({ assetId: asset.id, uploadUrl: ticket.uploadUrl, method: ticket.method });
  } catch (e) {
    reportError("upload-url", e);
    return apiError(502, "Could not create an upload. Check the video provider configuration.");
  }
}
