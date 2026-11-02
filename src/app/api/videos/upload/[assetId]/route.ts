import { createWriteStream } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { asService } from "@/lib/db/client";
import { apiUser, apiError, json } from "@/lib/api";
import { verifyUploadToken } from "@/lib/providers/video";
import { STORAGE_ROOT } from "@/lib/providers/storage";
import { audit } from "@/lib/services/audit";

export const runtime = "nodejs";
const MAX = 2 * 1024 ** 3;

/** LOCAL DEV video upload target (streams to disk). Production uses Cloudflare Stream direct uploads. */
export async function PUT(req: Request, { params }: { params: Promise<{ assetId: string }> }) {
  const { assetId } = await params;
  const user = await apiUser();
  const token = new URL(req.url).searchParams.get("token") || "";
  if (!user || !verifyUploadToken(assetId, user.id, token)) return apiError(403, "Upload link invalid or expired.");
  const [a] = await asService((tx) => tx`select provider, provider_uid, status from public.video_assets where id = ${assetId} and uploaded_by = ${user.id}`);
  if (!a || a.provider !== "local" || a.status !== "UPLOADING") return apiError(409, "This upload is not open.");
  const len = Number(req.headers.get("content-length") || 0);
  if (len > MAX) return apiError(413, "File too large.");
  if (!req.body) return apiError(400, "Empty body.");
  const dir = path.join(STORAGE_ROOT, "videos");
  await mkdir(dir, { recursive: true });
  const uid = String(a.provider_uid).replace(/[^a-z0-9_-]/gi, "");
  const tmp = path.join(dir, `${uid}.part`);
  try {
    let bytes = 0;
    const counter = new TransformStream<Uint8Array, Uint8Array>({ transform(chunk, c) { bytes += chunk.byteLength; if (bytes > MAX) c.error(new Error("too large")); else c.enqueue(chunk); } });
    await pipeline(Readable.fromWeb(req.body.pipeThrough(counter) as never), createWriteStream(tmp));
    const fh = await import("node:fs/promises").then((m) => m.open(tmp, "r"));
    const head = Buffer.alloc(12);
    await fh.read(head, 0, 12, 0);
    await fh.close();
    // ISO-BMFF ("ftyp") or Matroska/WebM (EBML) magic bytes
    if (!(head.subarray(4, 8).toString("latin1") === "ftyp" || head.readUInt32BE(0) === 0x1a45dfa3)) throw new Error("not a supported video container");
    await rename(tmp, path.join(dir, `${uid}.mp4`));
    const size = (await stat(path.join(dir, `${uid}.mp4`))).size;
    await asService((tx) => tx`update public.video_assets set status = 'READY', size_bytes = ${size} where id = ${assetId}`);
    await audit({ actorId: user.id, action: "video.upload_complete", entityType: "video_asset", entityId: assetId });
    return json({ ok: true, status: "READY" });
  } catch (e) {
    await rm(tmp, { force: true });
    await asService((tx) => tx`update public.video_assets set status = 'ERROR', error_message = ${String((e as Error).message)} where id = ${assetId}`);
    return apiError(400, `Upload failed: ${(e as Error).message}`);
  }
}
