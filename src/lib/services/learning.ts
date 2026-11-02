import { asService, asUser, type Tx } from "@/lib/db/client";
import { certificateCode } from "@/lib/crypto";
import { audit } from "@/lib/services/audit";
import { notify } from "@/lib/services/notifications";

/** A lesson counts as complete when ≥ 90% watched (video) or explicitly marked done (other kinds). */
export const COMPLETION_THRESHOLD = 0.9;

export function isVideoComplete(watchedSeconds: number, durationSeconds: number, ended: boolean): boolean {
  if (ended) return true;
  if (!durationSeconds) return false;
  return watchedSeconds / durationSeconds >= COMPLETION_THRESHOLD;
}

/**
 * Records playback progress through RLS (student can only write their own rows for courses
 * they are enrolled in). `watchedDelta` is capped server-side to prevent skipping to 100%.
 */
export async function recordProgress(
  user: { id: string; email: string },
  input: { lessonId: string; positionSeconds: number; watchedDelta: number; ended?: boolean; markComplete?: boolean },
) {
  return asUser(user, async (tx) => {
    const [lesson] = await tx`select id, course_id, kind, duration_seconds from public.lessons where id = ${input.lessonId}`;
    if (!lesson) return { ok: false as const, error: "Lesson not available." };
    const enrolled = await tx`select public.is_enrolled(${lesson.course_id}) as ok`;
    if (!enrolled[0].ok) return { ok: false as const, error: "Enroll to track progress." };
    const delta = Math.max(0, Math.min(Math.round(input.watchedDelta), 30)); // client heartbeats every ~10 s
    const pos = Math.max(0, Math.round(input.positionSeconds));
    const [row] = await tx`
      insert into public.lesson_progress (user_id, lesson_id, course_id, position_seconds, watched_seconds)
      values (${user.id}, ${lesson.id}, ${lesson.course_id}, ${pos}, ${delta})
      on conflict (user_id, lesson_id) do update
        set position_seconds = excluded.position_seconds,
            watched_seconds = least(public.lesson_progress.watched_seconds + ${delta}, greatest(${lesson.duration_seconds}::int, 1) * 2),
            updated_at = now()
      returning watched_seconds, completed`;
    let completed = row.completed as boolean;
    const canMark = lesson.kind !== "VIDEO" && input.markComplete;
    // "ended" alone is not trusted: require at least half the lesson to have been watched
    const endedOk = Boolean(input.ended) && (row.watched_seconds as number) >= (lesson.duration_seconds as number) * 0.5;
    if (!completed && (canMark || isVideoComplete(row.watched_seconds as number, lesson.duration_seconds as number, endedOk))) {
      await tx`update public.lesson_progress set completed = true, completed_at = now() where user_id = ${user.id} and lesson_id = ${lesson.id}`;
      completed = true;
    }
    return { ok: true as const, completed, courseId: lesson.course_id as string };
  }).then(async (r) => {
    if (r.ok) await refreshCourseProgress(user.id, r.courseId, input.lessonId);
    return r;
  });
}

export async function refreshCourseProgress(userId: string, courseId: string, lastLessonId?: string) {
  await asService(async (tx) => {
    const [{ total, done }] = await tx`
      select count(*) filter (where l.is_required)::int as total,
             count(*) filter (where l.is_required and lp.completed)::int as done
      from public.lessons l left join public.lesson_progress lp on lp.lesson_id = l.id and lp.user_id = ${userId}
      where l.course_id = ${courseId}`;
    const pct = (total as number) ? Math.round(((done as number) / (total as number)) * 10000) / 100 : 0;
    await tx`update public.enrollments set progress_percent = ${pct}, last_lesson_id = coalesce(${lastLessonId ?? null}, last_lesson_id)
             where user_id = ${userId} and course_id = ${courseId}`;
  });
  await issueCertificateIfEligible(userId, courseId);
}

export interface Requirement {
  key: string;
  label: string;
  met: boolean;
  detail: string;
}

/** Evaluates the configured completion requirements for a course. */
export async function evaluateCompletion(tx: Tx, userId: string, courseId: string): Promise<{ eligible: boolean; requirements: Requirement[] }> {
  const [c] = await tx`select certificate_enabled, min_attendance_percent, delivery from public.courses where id = ${courseId}`;
  const reqs: Requirement[] = [];
  const [l] = await tx`
    select count(*) filter (where l.is_required)::int as total, count(*) filter (where l.is_required and lp.completed)::int as done
    from public.lessons l left join public.lesson_progress lp on lp.lesson_id = l.id and lp.user_id = ${userId}
    where l.course_id = ${courseId} and l.kind in ('VIDEO','ARTICLE')`;
  if ((l.total as number) > 0)
    reqs.push({ key: "lessons", label: "Complete all required lessons", met: l.done === l.total, detail: `${l.done}/${l.total} lessons` });

  const quizzes = await tx`
    select q.id, q.title, q.pass_percent, coalesce(max(a.percent), 0)::float as best
    from public.quizzes q left join public.quiz_attempts a on a.quiz_id = q.id and a.user_id = ${userId} and a.submitted_at is not null
    where q.course_id = ${courseId} and q.is_required and q.is_published group by q.id`;
  for (const q of quizzes)
    reqs.push({ key: `quiz:${q.id}`, label: `Pass “${q.title}”`, met: (q.best as number) >= (q.pass_percent as number), detail: `best ${Math.round(q.best as number)}% / pass ${q.pass_percent}%` });

  const assigns = await tx`
    select a.id, a.title, a.pass_points, s.points, s.status from public.assignments a
    left join public.submissions s on s.assignment_id = a.id and s.user_id = ${userId}
    where a.course_id = ${courseId} and a.is_required`;
  for (const a of assigns)
    reqs.push({ key: `assignment:${a.id}`, label: `Pass assignment “${a.title}”`, met: a.status === "GRADED" && (a.points as number) >= (a.pass_points as number),
      detail: a.status ? (a.status === "GRADED" ? `${a.points} pts (pass ${a.pass_points})` : "awaiting grading") : "not submitted" });

  if ((c.min_attendance_percent as number) > 0) {
    const [att] = await tx`
      select count(*) filter (where s.status = 'ENDED')::int as held,
             count(*) filter (where s.status = 'ENDED' and at.duration_seconds >= s.duration_minutes * 60 * 0.5)::int as attended
      from public.live_sessions s left join public.attendance at on at.live_session_id = s.id and at.user_id = ${userId}
      where s.course_id = ${courseId}`;
    const pct = (att.held as number) ? ((att.attended as number) / (att.held as number)) * 100 : 0;
    reqs.push({ key: "attendance", label: `Attend at least ${c.min_attendance_percent}% of live classes`, met: (att.held as number) > 0 && pct >= (c.min_attendance_percent as number), detail: `${att.attended}/${att.held} classes` });
  }
  const eligible = Boolean(c.certificate_enabled) && reqs.length > 0 && reqs.every((r) => r.met);
  return { eligible, requirements: reqs };
}

export async function issueCertificateIfEligible(userId: string, courseId: string, issuedBy?: string) {
  return asService(async (tx) => {
    const [e] = await tx`select status from public.enrollments where user_id = ${userId} and course_id = ${courseId}`;
    if (!e || !["ACTIVE", "COMPLETED"].includes(e.status as string)) return null;
    const existing = await tx`select id from public.certificates where user_id = ${userId} and course_id = ${courseId}`;
    if (existing[0]) return existing[0].id as string;
    const { eligible } = await evaluateCompletion(tx, userId, courseId);
    if (!eligible) return null;
    const [info] = await tx`select p.full_name, p.email, c.title from public.profiles p, public.courses c where p.id = ${userId} and c.id = ${courseId}`;
    const [cert] = await tx`
      insert into public.certificates (user_id, course_id, verification_code, recipient_name, course_title, issued_by)
      values (${userId}, ${courseId}, ${certificateCode()}, ${(info.full_name as string) || (info.email as string).split("@")[0]}, ${info.title}, ${issuedBy ?? null})
      on conflict (user_id, course_id) do nothing returning id`;
    if (!cert) return null;
    await tx`update public.enrollments set status = 'COMPLETED', completed_at = now(), progress_percent = greatest(progress_percent, 100)
             where user_id = ${userId} and course_id = ${courseId}`;
    await audit({ actorId: issuedBy ?? null, action: "certificate.issue", entityType: "certificate", entityId: cert.id as string, metadata: { userId, courseId } }, tx);
    await notify(userId, { kind: "CERTIFICATE", title: `Certificate earned — ${info.title}`, body: "Congratulations! Your certificate is ready to download.", link: "/dashboard/certificates", email: true }, tx);
    return cert.id as string;
  });
}

// ── quizzes (graded on the server; answer keys never reach the browser) ────
export async function getQuizForStudent(user: { id: string; email: string }, quizId: string) {
  const quiz = await asUser(user, async (tx) => {
    const [q] = await tx`select q.*, c.slug as course_slug, c.title as course_title from public.quizzes q join public.courses c on c.id = q.course_id where q.id = ${quizId}`;
    return q ?? null;
  });
  if (!quiz) return null;
  const [questions, attempts] = await Promise.all([
    asService((tx) => tx`select id, prompt, options, points, position from public.questions where quiz_id = ${quizId} order by position`),
    asUser(user, (tx) => tx`select id, score, max_score, percent, passed, submitted_at from public.quiz_attempts where quiz_id = ${quizId} and user_id = ${user.id} order by started_at desc`),
  ]);
  return { quiz, questions: questions.map((q) => ({ id: q.id as string, prompt: q.prompt as string, options: q.options as string[], points: q.points as number })), attempts };
}

export function gradeAnswers(questions: { id: string; correct_index: number; points: number }[], answers: Record<string, number>) {
  let score = 0, max = 0;
  for (const q of questions) {
    max += q.points;
    if (answers[q.id] === q.correct_index) score += q.points;
  }
  const percent = max ? Math.round((score / max) * 10000) / 100 : 0;
  return { score, max, percent };
}

export async function submitQuiz(user: { id: string; email: string }, quizId: string, answers: Record<string, number>) {
  const visible = await asUser(user, (tx) => tx`select id, course_id from public.quizzes where id = ${quizId} and is_published`);
  if (!visible[0]) return { ok: false as const, error: "Quiz not available." };
  const courseId = visible[0].course_id as string;
  const res = await asService(async (tx) => {
    const [q] = await tx`select * from public.quizzes where id = ${quizId}`;
    const [{ n }] = await tx`select count(*)::int as n from public.quiz_attempts where quiz_id = ${quizId} and user_id = ${user.id} and submitted_at is not null`;
    if (q.max_attempts && (n as number) >= (q.max_attempts as number)) return { ok: false as const, error: "No attempts remaining." };
    const questions = await tx`select id, correct_index, points, explanation from public.questions where quiz_id = ${quizId}`;
    const g = gradeAnswers(questions as unknown as { id: string; correct_index: number; points: number }[], answers);
    const passed = g.percent >= (q.pass_percent as number);
    const [a] = await tx`insert into public.quiz_attempts (quiz_id, user_id, answers, score, max_score, percent, passed, submitted_at)
                         values (${quizId}, ${user.id}, ${tx.json(answers)}, ${g.score}, ${g.max}, ${g.percent}, ${passed}, now()) returning id`;
    // the answer key is revealed only once the student has passed (prevents answer harvesting on retakes)
    const review = questions.map((qq) => ({
      id: qq.id as string, correct: answers[qq.id as string] === qq.correct_index,
      correctIndex: passed ? (qq.correct_index as number) : null, explanation: passed ? (qq.explanation as string) : "",
    }));
    return { ok: true as const, attemptId: a.id as string, ...g, passed, passPercent: q.pass_percent as number, review };
  });
  if (res.ok) await issueCertificateIfEligible(user.id, courseId);
  return res;
}
