import { z } from "zod";
import { guard, json, apiError } from "@/lib/api";
import { setSessionStatus } from "@/lib/services/live";

const body = z.object({ status: z.enum(["LIVE", "ENDED", "CANCELLED"]) });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard(req, { permission: "live.host" });
  if (g.error) return g.error;
  const { id } = await params;
  const p = body.safeParse(await req.json().catch(() => null));
  if (!p.success) return apiError(400, "Invalid status");
  try {
    await setSessionStatus(g.user, id, p.data.status);
    return json({ ok: true });
  } catch {
    return apiError(403, "Only the assigned host or a Super Admin can change this class.");
  }
}
