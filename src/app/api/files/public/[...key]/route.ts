import { readFileFromStorage, sniffMime } from "@/lib/providers/storage";
import { apiError } from "@/lib/api";

export const runtime = "nodejs";

/** Serves PUBLIC local uploads (course thumbnails) in development. Supabase Storage serves them directly in production. */
export async function GET(_req: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const { key } = await params;
  const k = key.join("/");
  if (k.includes("..") || !/^[a-z0-9/_.-]+$/i.test(k)) return apiError(400, "Bad key");
  try {
    const buf = await readFileFromStorage("local", "public", k);
    const m = sniffMime(buf);
    if (!m || !m.mime.startsWith("image/")) return apiError(415, "Not an image");
    return new Response(new Uint8Array(buf), { headers: { "Content-Type": m.mime, "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" } });
  } catch {
    return apiError(404, "Not found");
  }
}
