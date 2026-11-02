import { asService, asUser, type Tx } from "@/lib/db/client";
import { audit } from "@/lib/services/audit";
import { notify } from "@/lib/services/notifications";

export type EnrollmentSource = "FREE" | "PURCHASE" | "COUPON" | "COMPLIMENTARY" | "INVITATION" | "ADMIN";

export interface EligibilityCourse {
  id: string;
  status: string;
  enrollment_open: boolean;
  enrollment_capacity: number | null;
  enrollment_starts_at: Date | string | null;
  enrollment_ends_at: Date | string | null;
}

/** Pure eligibility rules (capacity count passed in) — unit tested. */
export function eligibilityError(c: EligibilityCourse, activeCount: number, now = new Date()): string | null {
  if (c.status !== "PUBLISHED") return "This course is not open for enrollment.";
  if (!c.enrollment_open) return "Enrollment for this course is currently closed.";
  if (c.enrollment_starts_at && new Date(c.enrollment_starts_at) > now) return "Enrollment has not opened yet.";
  if (c.enrollment_ends_at && new Date(c.enrollment_ends_at) < now) return "Enrollment for this course has ended.";
  if (c.enrollment_capacity != null && activeCount >= c.enrollment_capacity) return "This course is full.";
  return null;
}

export async function loadEligibility(tx: Tx, courseId: string) {
  const [c] = await tx`select id, slug, title, status, is_free, price_paise, currency, enrollment_open, enrollment_capacity,
                              enrollment_starts_at, enrollment_ends_at, access_days
                       from public.courses where id = ${courseId} for share`;
  if (!c) return null;
  const [{ n }] = await tx`select count(*)::int as n from public.enrollments where course_id = ${courseId} and status in ('ACTIVE','COMPLETED')`;
  return { course: c, activeCount: n as number };
}

/**
 * Creates (or re-activates) an enrollment. MUST only be called by trusted server code
 * after the relevant check (free course / verified payment / valid invitation / admin).
 * Idempotent: unique(user_id, course_id) prevents duplicates.
 */
export async function grantEnrollment(
  tx: Tx,
  input: { userId: string; courseId: string; source: EnrollmentSource; orderId?: string | null; invitationId?: string | null; grantedBy?: string | null; accessDays?: number | null },
): Promise<{ id: string; created: boolean }> {
  const expires = input.accessDays ? new Date(Date.now() + input.accessDays * 86400_000) : null;
  const rows = await tx`
    insert into public.enrollments (user_id, course_id, status, source, order_id, invitation_id, granted_by, expires_at)
    values (${input.userId}, ${input.courseId}, 'ACTIVE', ${input.source}, ${input.orderId ?? null}, ${input.invitationId ?? null}, ${input.grantedBy ?? null}, ${expires})
    on conflict (user_id, course_id) do update
      set status = 'ACTIVE', source = excluded.source, order_id = coalesce(excluded.order_id, public.enrollments.order_id),
          expires_at = excluded.expires_at, updated_at = now()
      where public.enrollments.status in ('REVOKED', 'REFUNDED')
    returning id, (xmax = 0) as created`;
  if (rows[0]) return { id: rows[0].id as string, created: Boolean(rows[0].created) };
  const [existing] = await tx`select id from public.enrollments where user_id = ${input.userId} and course_id = ${input.courseId}`;
  return { id: existing.id as string, created: false };
}

export type EnrollResult = { ok: true; alreadyEnrolled: boolean } | { ok: false; error: string; needsPayment?: boolean };

/** Student self-enrollment into a FREE course. Paid courses always go through checkout. */
export async function enrollFree(user: { id: string; email: string }, courseId: string): Promise<EnrollResult> {
  // read through RLS first: the course must be visible to this user
  const visible = await asUser(user, (tx) => tx`select id from public.courses where id = ${courseId}`);
  if (!visible[0]) return { ok: false, error: "Course not found." };

  const result = await asService(async (tx): Promise<EnrollResult> => {
    const el = await loadEligibility(tx, courseId);
    if (!el) return { ok: false, error: "Course not found." };
    if (!el.course.is_free) return { ok: false, error: "This is a paid course.", needsPayment: true };
    const [already] = await tx`select status from public.enrollments where user_id = ${user.id} and course_id = ${courseId}`;
    if (already && ["ACTIVE", "COMPLETED"].includes(already.status as string)) return { ok: true, alreadyEnrolled: true };
    const err = eligibilityError(el.course as unknown as EligibilityCourse, el.activeCount);
    if (err) return { ok: false, error: err };
    await grantEnrollment(tx, { userId: user.id, courseId, source: "FREE", accessDays: el.course.access_days as number | null });
    await audit({ actorId: user.id, action: "enrollment.free", entityType: "course", entityId: courseId }, tx);
    await notify(user.id, { kind: "ENROLLMENT", title: `You're enrolled in ${el.course.title}`, body: "Start learning any time from your dashboard.", link: `/dashboard/courses` }, tx);
    return { ok: true, alreadyEnrolled: false };
  });
  return result;
}

export async function revokeEnrollment(adminId: string, enrollmentId: string, reason: string) {
  await asService(async (tx) => {
    const [e] = await tx`update public.enrollments set status = 'REVOKED' where id = ${enrollmentId} returning user_id, course_id`;
    if (!e) throw new Error("Enrollment not found");
    await audit({ actorId: adminId, actorRole: "SUPER_ADMIN", action: "enrollment.revoke", entityType: "enrollment", entityId: enrollmentId, metadata: { reason } }, tx);
  });
}
