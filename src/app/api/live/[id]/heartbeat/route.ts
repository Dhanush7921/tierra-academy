import { guard, json, apiError } from "@/lib/api";
import { attendanceHeartbeat } from "@/lib/services/live";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard(req, { limit: [10, 60], key: "live-heartbeat" });
  if (g.error) return g.error;
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const ok = await attendanceHeartbeat(g.user, id, Boolean(body?.leaving));
  return ok ? json({ ok: true }) : apiError(403, "Not allowed in this class.");
}
