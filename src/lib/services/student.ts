import { asUser } from "@/lib/db/client";

type U = { id: string; email: string };

/** Student-facing reads. Everything runs through RLS as the student. */
export async function dashboardData(user: U) {
  return asUser(user, async (tx) => {
    const courses = await tx`
      select c.id, c.slug, c.title, cat.slug as category_slug, cat.name as category_name, cat.accent, e.status, e.progress_percent::float as progress,
             e.last_lesson_id, e.updated_at, c.thumbnail_url
      from public.enrollments e join public.courses c on c.id = e.course_id join public.course_categories cat on cat.id = c.category_id
      where e.user_id = ${user.id} and e.status in ('ACTIVE','COMPLETED') order by e.updated_at desc`;
    const live = await tx`
      select s.id, s.title, s.starts_at, s.duration_minutes, s.status, c.title as course_title
      from public.live_sessions s join public.courses c on c.id = s.course_id
      where s.status in ('SCHEDULED','LIVE') and s.starts_at > now() - interval '2 hours' and public.is_enrolled(s.course_id)
      order by s.starts_at limit 5`;
    const [stats] = await tx`
      select (select count(*) from public.lesson_progress where user_id = ${user.id} and completed)::int as lessons_done,
             (select count(*) from public.certificates where user_id = ${user.id} and revoked_at is null)::int as certificates,
             (select count(*) from public.quiz_attempts where user_id = ${user.id} and passed)::int as quizzes_passed,
             (select count(*) from public.attendance where user_id = ${user.id})::int as classes_attended`;
    const weekly = await tx`
      select to_char(d, 'Dy') as day, (select count(*) from public.lesson_progress lp where lp.user_id = ${user.id} and lp.completed_at >= d and lp.completed_at < d + interval '1 day')::int as n
      from generate_series(date_trunc('day', now()) - interval '6 days', date_trunc('day', now()), interval '1 day') d`;
    const enrolledCats = [...new Set(courses.map((c) => c.category_slug as string))];
    const recs = await tx`
      select c.id, c.slug, c.title, c.subtitle, c.is_free, c.price_paise, c.currency, cat.slug as category_slug, cat.name as category_name, cat.accent
      from public.courses c join public.course_categories cat on cat.id = c.category_id
      where c.status = 'PUBLISHED' and not exists (select 1 from public.enrollments e where e.course_id = c.id and e.user_id = ${user.id})
      order by (cat.slug = any(${enrolledCats})) desc, c.is_free desc, c.published_at desc limit 3`;
    let continueLesson: { slug: string; lessonId: string | null; title: string } | null = null;
    const active = courses.find((c) => c.status === "ACTIVE");
    if (active) continueLesson = { slug: active.slug as string, lessonId: active.last_lesson_id as string | null, title: active.title as string };
    return { courses, live, stats, weekly, recs, continueLesson };
  });
}

export async function learnData(user: U, slug: string, lessonId?: string) {
  return asUser(user, async (tx) => {
    const [c] = await tx`select c.id, c.slug, c.title, c.delivery, public.is_enrolled(c.id) as enrolled, public.manages_course(c.id) as staff
                         from public.courses c where c.slug = ${slug}`;
    if (!c) return null;
    const lessons = await tx`
      select l.id, l.title, l.kind, l.duration_seconds, l.is_preview, l.summary, l.body, l.video_asset_id, m.id as module_id, m.title as module_title, m.position as mpos, l.position as lpos,
             coalesce(lp.completed, false) as completed, coalesce(lp.position_seconds, 0) as resume_at
      from public.lessons l join public.course_modules m on m.id = l.module_id
      left join public.lesson_progress lp on lp.lesson_id = l.id and lp.user_id = ${user.id}
      where l.course_id = ${c.id} order by m.position, l.position`;
    const [enr] = await tx`select progress_percent::float as progress, last_lesson_id, status from public.enrollments where user_id = ${user.id} and course_id = ${c.id}`;
    const current = lessons.find((l) => l.id === lessonId) ?? lessons.find((l) => l.id === enr?.last_lesson_id) ?? lessons.find((l) => !l.completed) ?? lessons[0];
    const resources = current ? await tx`select id, title, mime_type, size_bytes from public.lesson_resources where lesson_id = ${current.id} order by created_at` : [];
    const quizzes = await tx`select id, title, lesson_id, pass_percent from public.quizzes where course_id = ${c.id} and is_published order by created_at`;
    const assignments = await tx`select a.id, a.title, a.due_at, s.status as submission_status from public.assignments a
                                 left join public.submissions s on s.assignment_id = a.id and s.user_id = ${user.id} where a.course_id = ${c.id}`;
    const captions = current?.video_asset_id ? [] : [];
    return { course: c, lessons, current, enrollment: enr ?? null, resources, quizzes, assignments, captions };
  });
}

export async function myAssignments(user: U) {
  return asUser(user, (tx) => tx`
    select a.id, a.title, a.instructions, a.due_at, a.max_points, a.pass_points, a.allow_text, a.allow_link, a.allow_file, a.max_file_mb,
           c.title as course_title, c.slug as course_slug, s.status, s.points, s.feedback, s.submitted_at, s.text_answer, s.link_url, s.file_key
    from public.assignments a join public.courses c on c.id = a.course_id
    left join public.submissions s on s.assignment_id = a.id and s.user_id = ${user.id}
    where public.is_enrolled(a.course_id) order by a.due_at nulls last`);
}

export async function myResources(user: U) {
  return asUser(user, (tx) => tx`
    select r.id, r.title, r.mime_type, r.size_bytes, l.title as lesson_title, c.title as course_title, c.slug as course_slug
    from public.lesson_resources r join public.lessons l on l.id = r.lesson_id join public.courses c on c.id = r.course_id
    where public.is_enrolled(r.course_id) order by c.title, l.position`);
}

export async function myLiveSessions(user: U) {
  return asUser(user, (tx) => tx`
    select s.id, s.title, s.starts_at, s.duration_minutes, s.status, s.recording_status, s.is_demo, c.title as course_title, c.slug as course_slug,
           a.duration_seconds as attended_seconds
    from public.live_sessions s join public.courses c on c.id = s.course_id
    left join public.attendance a on a.live_session_id = s.id and a.user_id = ${user.id}
    where public.is_enrolled(s.course_id) and s.status in ('SCHEDULED','LIVE','ENDED')
    order by (s.status = 'ENDED'), s.starts_at limit 50`);
}

export async function myCertificates(user: U) {
  return asUser(user, (tx) => tx`select id, verification_code, course_title, recipient_name, issued_at, revoked_at from public.certificates where user_id = ${user.id} order by issued_at desc`);
}

export async function myPayments(user: U) {
  return asUser(user, (tx) => tx`
    select o.id, o.receipt, o.status, o.amount_paise, o.subtotal_paise, o.discount_paise, o.currency, o.provider, o.created_at, o.paid_at,
           c.title as course_title, c.slug as course_slug,
           (select r.status from public.refunds r where r.order_id = o.id order by r.created_at desc limit 1) as refund_status
    from public.orders o join public.courses c on c.id = o.course_id where o.user_id = ${user.id} order by o.created_at desc limit 100`);
}

export async function myNotifications(user: U, page = 1, pageSize = 20) {
  return asUser(user, async (tx) => {
    const rows = await tx`select *, count(*) over()::int as total from public.notifications where user_id = ${user.id}
                          order by created_at desc limit ${pageSize} offset ${(page - 1) * pageSize}`;
    return { rows, total: (rows[0]?.total as number) ?? 0, pages: Math.max(1, Math.ceil(((rows[0]?.total as number) ?? 0) / pageSize)) };
  });
}
