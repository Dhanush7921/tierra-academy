import { readFile } from "node:fs/promises";
import path from "node:path";
import { asService, asUser } from "@/lib/db/client";
import { apiUser, apiError } from "@/lib/api";
import { STORAGE_ROOT } from "@/lib/providers/storage";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ assetId: string; lang: string }> }) {
  const { assetId, lang } = await params;
  const user = await apiUser();
  if (!user) return apiError(401, "Sign in required.");
  // the user must be able to see (through RLS) a lesson that uses this asset
  const [ok] = await asUser(user, (tx) => tx`select 1 from public.lessons where video_asset_id = ${assetId} limit 1`);
  if (!ok) return apiError(403, "Not authorised.");
  const [a] = await asService((tx) => tx`select provider_uid, captions from public.video_assets where id = ${assetId}`);
  const cap = (a?.captions as { lang: string; src: string }[] | undefined)?.find((c) => c.lang === lang);
  if (!cap) return apiError(404, "No captions.");
  try {
    const dir = path.join(STORAGE_ROOT, a.provider_uid && String(a.provider_uid).startsWith("demo-") ? "sample" : "uploads/private");
    const vtt = await readFile(path.join(dir, path.basename(cap.src)), "utf8");
    return new Response(vtt, { headers: { "Content-Type": "text/vtt; charset=utf-8", "Cache-Control": "private, max-age=300" } });
  } catch {
    return apiError(404, "Caption file missing.");
  }
}
