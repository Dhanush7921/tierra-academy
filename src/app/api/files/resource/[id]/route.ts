import { asUser } from "@/lib/db/client";
import { apiUser, apiError } from "@/lib/api";
import { readFileFromStorage } from "@/lib/providers/storage";

export const runtime = "nodejs";

/** Private lesson resources — RLS allows only enrolled students and assigned staff. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await apiUser();
  if (!user) return apiError(401, "Sign in required.");
  const [r] = await asUser(user, (tx) => tx`select title, storage_provider, storage_key, mime_type from public.lesson_resources where id = ${id}`).catch(() => []);
  if (!r) return apiError(404, "Not found or not enrolled.");
  try {
    const buf = await readFileFromStorage(r.storage_provider as string, "private", r.storage_key as string);
    const name = `${String(r.title).replace(/[^\w.-]+/g, "_").slice(0, 80)}.${String(r.mime_type).split("/")[1] ?? "bin"}`;
    return new Response(new Uint8Array(buf), { headers: { "Content-Type": r.mime_type as string, "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch {
    return apiError(404, "File missing.");
  }
}
