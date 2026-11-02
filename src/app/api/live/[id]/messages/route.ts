import { z } from "zod";
import { asUser } from "@/lib/db/client";
import { guard, json, apiError } from "@/lib/api";
import { LIMITS } from "@/lib/rate-limit";

/** Class chat + participant list (polling). RLS: only enrolled students and course staff. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard(req);
  if (g.error) return g.error;
  const { id } = await params;
  const after = Math.max(0, Number(new URL(req.url).searchParams.get("after")) || 0);
  const [messages, participants] = await asUser(g.user, async (tx) => [
    await tx`select m.id::int as id, m.body, m.created_at, m.user_id, coalesce(n.display_name, 'Student') as full_name
             from public.live_session_messages m left join public.live_display_names(${id}) n on n.user_id = m.user_id
             where m.live_session_id = ${id} and m.id > ${after} order by m.id limit 100`.catch(() => []),
    await tx`select n.user_id, n.display_name as full_name from public.live_display_names(${id}) n where n.active`.catch(() => []),
  ]);
  // students only ever see "First L." for classmates (privacy); full profiles stay protected by RLS
  return json({ messages, participants });
}

const body = z.object({ body: z.string().trim().min(1).max(1000) });
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard(req, { limit: LIMITS.liveChat, key: "live-chat" });
  if (g.error) return g.error;
  const { id } = await params;
  const p = body.safeParse(await req.json().catch(() => null));
  if (!p.success) return apiError(400, "Message must be 1–1000 characters.");
  try {
    await asUser(g.user, (tx) => tx`insert into public.live_session_messages (live_session_id, user_id, body) values (${id}, ${g.user.id}, ${p.data.body})`);
    return json({ ok: true });
  } catch {
    return apiError(403, "You can't post in this class.");
  }
}
