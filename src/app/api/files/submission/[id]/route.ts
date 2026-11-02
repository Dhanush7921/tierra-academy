import { asUser } from "@/lib/db/client";
import { apiUser, apiError } from "@/lib/api";
import { readFileFromStorage } from "@/lib/providers/storage";

export const runtime = "nodejs";

/** Assignment files — visible to the submitting student and the course's graders (RLS). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await apiUser();
  if (!user) return apiError(401, "Sign in required.");
  const [s] = await asUser(user, (tx) => tx`select file_key, file_mime from public.submissions where id = ${id}`).catch(() => []);
  if (!s?.file_key) return apiError(404, "Not found");
  const [provider, ...rest] = String(s.file_key).split(":");
  try {
    const buf = await readFileFromStorage(provider, "private", rest.join(":"));
    return new Response(new Uint8Array(buf), { headers: { "Content-Type": s.file_mime as string, "Content-Disposition": `attachment; filename="submission-${id.slice(0, 8)}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch {
    return apiError(404, "File missing.");
  }
}
