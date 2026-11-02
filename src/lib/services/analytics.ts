import { asService, asUser } from "@/lib/db/client";

type Actor = { id: string; email: string; roles: string[] };

/**
 * Dashboard statistics from real queries.
 * Super Admin → platform-wide incl. revenue. Content Manager → only assigned courses, no revenue.
 */
export async function adminOverview(actor: Actor) {
  const sa = actor.roles.includes("SUPER_ADMIN");
  if (sa) {
    return asService(async (tx) => {
      const [k] = await tx`
        select
          (select count(*) from public.user_roles where role = 'STUDENT')::int as students,
          (select count(*) from public.profiles where created_at > now() - interval '30 days')::int as new_users_30d,
          (select count(*) from public.courses where status = 'PUBLISHED')::int as published_courses,
          (select count(*) from public.courses)::int as total_courses,
          (select count(*) from public.enrollments where status in ('ACTIVE','COMPLETED'))::int as enrollments,
          (select count(*) from public.enrollments where created_at > now() - interval '30 days')::int as enrollments_30d,
          (select count(*) from public.live_sessions where status = 'SCHEDULED' and starts_at > now())::int as upcoming_live,
          (select count(*) from public.approval_requests where status = 'PENDING')::int as pending_approvals,
          (select coalesce(sum(amount_paise), 0) from public.orders where status in ('PAID','PARTIALLY_REFUNDED'))::bigint as gross_paise,
          (select coalesce(sum(amount_paise), 0) from public.refunds where status = 'PROCESSED')::bigint as refunded_paise,
          (select count(*) from public.refunds where status = 'REQUESTED')::int as open_refunds,
          (select count(*) from public.certificates where revoked_at is null)::int as certificates`;
      const daily = await tx`
        select to_char(d, 'YYYY-MM-DD') as day,
               (select count(*) from public.enrollments e where e.created_at >= d and e.created_at < d + interval '1 day')::int as enrollments,
               (select coalesce(sum(o.amount_paise), 0) from public.orders o where o.status in ('PAID','PARTIALLY_REFUNDED','REFUNDED') and o.paid_at >= d and o.paid_at < d + interval '1 day')::bigint as revenue
        from generate_series(date_trunc('day', now()) - interval '29 days', date_trunc('day', now()), interval '1 day') d`;
      const byCategory = await tx`
        select cat.name, cat.accent, count(e.id)::int as enrollments
        from public.course_categories cat left join public.courses c on c.category_id = cat.id
        left join public.enrollments e on e.course_id = c.id and e.status in ('ACTIVE','COMPLETED')
        group by cat.id order by cat.sort_order`;
      const topCourses = await tx`
        select c.id, c.title, count(e.id)::int as enrollments, avg(e.progress_percent)::float as avg_progress
        from public.courses c left join public.enrollments e on e.course_id = c.id
        where c.status = 'PUBLISHED' group by c.id order by enrollments desc, c.title limit 6`;
      const recentActivity = await tx`
        select a.action, a.entity_type, a.created_at, p.full_name, p.email from public.audit_logs a
        left join public.profiles p on p.id = a.actor_id order by a.created_at desc limit 8`;
      const pending = await tx`
        select r.id, r.kind, r.note, r.created_at, c.title as course_title, p.full_name as requested_by_name
        from public.approval_requests r join public.courses c on c.id = r.course_id left join public.profiles p on p.id = r.requested_by
        where r.status = 'PENDING' order by r.created_at limit 6`;
      return { scope: "platform" as const, kpis: k, daily, byCategory, topCourses, recentActivity, pending };
    });
  }
  // Content Manager: RLS limits every query to assigned courses
  return asUser(actor, async (tx) => {
    const [k] = await tx`
      select
        (select count(*) from public.courses where public.manages_course(id))::int as total_courses,
        (select count(*) from public.courses where public.manages_course(id) and status = 'PUBLISHED')::int as published_courses,
        (select count(*) from public.enrollments)::int as enrollments,
        (select count(*) from public.enrollments where created_at > now() - interval '30 days')::int as enrollments_30d,
        (select count(*) from public.live_sessions where status in ('SCHEDULED','PROPOSED') and starts_at > now() and public.manages_course(course_id))::int as upcoming_live,
        (select count(*) from public.approval_requests where status = 'PENDING' and requested_by = auth.uid())::int as pending_approvals,
        (select count(*) from public.submissions where status = 'SUBMITTED')::int as to_grade`;
    const daily = await tx`
      select to_char(d, 'YYYY-MM-DD') as day,
             (select count(*) from public.enrollments e where e.created_at >= d and e.created_at < d + interval '1 day')::int as enrollments
      from generate_series(date_trunc('day', now()) - interval '29 days', date_trunc('day', now()), interval '1 day') d`;
    const topCourses = await tx`
      select c.id, c.title, c.status, count(e.id)::int as enrollments, coalesce(avg(e.progress_percent), 0)::float as avg_progress
      from public.courses c left join public.enrollments e on e.course_id = c.id
      where public.manages_course(c.id) group by c.id order by enrollments desc limit 8`;
    const pending = await tx`
      select r.id, r.kind, r.note, r.status, r.created_at, c.title as course_title from public.approval_requests r
      join public.courses c on c.id = r.course_id where r.requested_by = auth.uid() order by r.created_at desc limit 6`;
    return { scope: "assigned" as const, kpis: k, daily, byCategory: [], topCourses, recentActivity: [], pending };
  });
}

export async function courseAnalytics(actor: Actor, courseId: string) {
  return asUser(actor, async (tx) => {
    const [ok] = await tx`select public.manages_course(${courseId}) as ok`;
    if (!ok.ok) return null;
    const [summary] = await tx`
      select count(*)::int as enrolled, count(*) filter (where status = 'COMPLETED')::int as completed,
             coalesce(avg(progress_percent), 0)::float as avg_progress
      from public.enrollments where course_id = ${courseId}`;
    const lessons = await tx`
      select l.title, count(lp.user_id) filter (where lp.completed)::int as completions
      from public.lessons l left join public.lesson_progress lp on lp.lesson_id = l.id
      where l.course_id = ${courseId} group by l.id order by min(l.position) limit 20`;
    const quizzes = await tx`
      select q.title, count(a.id)::int as attempts, coalesce(avg(a.percent), 0)::float as avg_percent,
             count(a.id) filter (where a.passed)::int as passed
      from public.quizzes q left join public.quiz_attempts a on a.quiz_id = q.id
      where q.course_id = ${courseId} group by q.id`;
    return { summary, lessons, quizzes };
  });
}
