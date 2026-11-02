import { z } from "zod";
import { guard, json, apiError } from "@/lib/api";
import { recordProgress } from "@/lib/services/learning";

const body = z.object({ lessonId: z.string().uuid(), positionSeconds: z.number().min(0).max(86400), watchedDelta: z.number().min(0).max(600), ended: z.boolean().optional() });

export async function POST(req: Request) {
  const g = await guard(req, { limit: [60, 60], key: "progress" });
  if (g.error) return g.error;
  const p = body.safeParse(await req.json().catch(() => null));
  if (!p.success) return apiError(400, "Invalid progress payload.");
  const r = await recordProgress(g.user, p.data);
  return r.ok ? json({ ok: true, completed: r.completed }) : apiError(403, r.error);
}
