import { asUser } from "@/lib/db/client";
import { apiUser, apiError } from "@/lib/api";
import { audit } from "@/lib/services/audit";

/** Self-service data export (JSON) — everything the student can see about themselves through RLS. */
export async function GET() {
  const user = await apiUser();
  if (!user) return apiError(401, "Sign in required.");
  const data = await asUser(user, async (tx) => ({
    exportedAt: new Date().toISOString(),
    profile: (await tx`select id, email, full_name, phone, city, bio, notify_email, notify_live_reminders, created_at from public.profiles where id = ${user.id}`)[0],
    roles: await tx`select role, created_at from public.user_roles where user_id = ${user.id}`,
    enrollments: await tx`select e.status, e.source, e.progress_percent, e.created_at, e.completed_at, c.title from public.enrollments e join public.courses c on c.id = e.course_id where e.user_id = ${user.id}`,
    lessonProgress: await tx`select lesson_id, completed, position_seconds, watched_seconds, updated_at from public.lesson_progress where user_id = ${user.id}`,
    quizAttempts: await tx`select quiz_id, percent, passed, submitted_at from public.quiz_attempts where user_id = ${user.id}`,
    submissions: await tx`select assignment_id, status, points, feedback, submitted_at, text_answer, link_url from public.submissions where user_id = ${user.id}`,
    attendance: await tx`select live_session_id, joined_at, duration_seconds from public.attendance where user_id = ${user.id}`,
    orders: await tx`select receipt, status, amount_paise, currency, created_at, paid_at from public.orders where user_id = ${user.id}`,
    payments: await tx`select provider, status, amount_paise, method, created_at from public.payments where user_id = ${user.id}`,
    certificates: await tx`select verification_code, course_title, issued_at, revoked_at from public.certificates where user_id = ${user.id}`,
    notifications: await tx`select kind, title, body, created_at, read_at from public.notifications where user_id = ${user.id}`,
  }));
  await audit({ actorId: user.id, action: "privacy.self_export", entityType: "profile", entityId: user.id });
  return new Response(JSON.stringify(data, null, 2), { headers: { "Content-Type": "application/json", "Content-Disposition": 'attachment; filename="tierra-academy-my-data.json"', "Cache-Control": "no-store" } });
}
