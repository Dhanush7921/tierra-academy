import { createReadStream, statSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { asService } from "@/lib/db/client";
import { apiUser, apiError } from "@/lib/api";
import { verifyMediaSignature } from "@/lib/providers/video";
import { STORAGE_ROOT } from "@/lib/providers/storage";

export const runtime = "nodejs";

/**
 * Streams local/sample video with HTTP Range support.
 * Requires BOTH a valid, unexpired HMAC signature AND the signed-in user to match the signed user id.
 */
export async function GET(req: Request, { params }: { params: Promise<{ assetId: string }> }) {
  const { assetId } = await params;
  const u = new URL(req.url);
  const uid = u.searchParams.get("u") || "", exp = Number(u.searchParams.get("exp")), sig = u.searchParams.get("sig") || "";
  if (!verifyMediaSignature(assetId, uid, exp, sig)) return apiError(403, "Link expired.");
  const user = await apiUser();
  if (!user || user.id !== uid) return apiError(403, "Not authorised.");
  const [a] = await asService((tx) => tx`select provider, provider_uid from public.video_assets where id = ${assetId}`);
  if (!a || !["local", "sample"].includes(a.provider as string)) return apiError(404, "Not found");
  const file = a.provider === "sample"
    ? path.join(STORAGE_ROOT, "sample", `${String(a.provider_uid).replace(/[^a-z0-9_-]/gi, "")}.mp4`)
    : path.join(STORAGE_ROOT, "videos", `${String(a.provider_uid).replace(/[^a-z0-9_-]/gi, "")}.mp4`);
  let size: number;
  try { size = statSync(file).size; } catch { return apiError(404, "Video file missing on this server (run npm run media:samples)."); }
  const range = req.headers.get("range");
  const headers: Record<string, string> = { "Content-Type": "video/mp4", "Accept-Ranges": "bytes", "Cache-Control": "private, no-store", "Content-Disposition": "inline", "X-Content-Type-Options": "nosniff" };
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    const start = m?.[1] ? parseInt(m[1], 10) : 0;
    const end = Math.min(m?.[2] ? parseInt(m[2], 10) : start + 1024 * 1024 - 1, size - 1);
    if (start >= size || start > end) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    return new Response(Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream, {
      status: 206, headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) },
    });
  }
  return new Response(Readable.toWeb(createReadStream(file)) as ReadableStream, { status: 200, headers: { ...headers, "Content-Length": String(size) } });
}
