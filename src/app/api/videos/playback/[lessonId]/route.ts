import { asService, asUser } from "@/lib/db/client";
import { guard, json, apiError, reportError } from "@/lib/api";
import { playbackFor, type VideoProviderName } from "@/lib/providers/video";
import { apiPath } from "@/lib/paths";

/** Issues a short-lived, user-bound playback URL/token after RLS confirms access to the lesson. */
export async function GET(req: Request, { params }: { params: Promise<{ lessonId: string }> }) {
  const g = await guard(req, { limit: [60, 60], key: "playback" });
  if (g.error) return g.error;
  const { lessonId } = await params;
  const [lesson] = await asUser(g.user, (tx) => tx`
    select l.id, l.video_asset_id, l.course_id, l.is_preview, public.is_enrolled(l.course_id) as enrolled, public.manages_course(l.course_id) as staff,
           (select position_seconds from public.lesson_progress where lesson_id = l.id and user_id = ${g.user.id}) as resume_at
    from public.lessons l where l.id = ${lessonId}`).catch(() => []);
  if (!lesson) return apiError(404, "Lesson not found or you are not enrolled.");
  if (!lesson.enrolled && !lesson.staff && !lesson.is_preview) return apiError(403, "Enroll to watch this lesson.");
  if (!lesson.video_asset_id) return apiError(404, "No video for this lesson yet.");
  const [asset] = await asService((tx) => tx`select id, provider, provider_uid, status, captions, duration_seconds from public.video_assets where id = ${lesson.video_asset_id}`);
  if (!asset || asset.status !== "READY") return apiError(409, "This video is still processing. Please check back shortly.");
  try {
    const pb = await playbackFor({ id: asset.id as string, provider: asset.provider as VideoProviderName, provider_uid: asset.provider_uid as string }, g.user.id);
    const captions = asset.provider === "cloudflare" ? [] : (asset.captions as { lang: string; label: string }[]).map((c) => ({ lang: c.lang, label: c.label, src: apiPath(`/media/captions/${asset.id}/${c.lang}`) }));
    return json({ ...pb, captions, resumeAt: Number(lesson.resume_at ?? 0), durationSeconds: asset.duration_seconds ?? 0 });
  } catch (e) {
    reportError("playback", e);
    return apiError(502, "The video service is unavailable right now.");
  }
}
