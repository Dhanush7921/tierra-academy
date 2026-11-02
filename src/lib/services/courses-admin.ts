import { revalidateTag } from "next/cache";
import { asService, asUser } from "@/lib/db/client";
import { audit } from "@/lib/services/audit";
import { notify, notifySuperAdmins } from "@/lib/services/notifications";
import { slugify } from "@/lib/format";
import { randomCode } from "@/lib/crypto";

type Actor = { id: string; email: string; roles: string[] };
const isSA = (a: Actor) => a.roles.includes("SUPER_ADMIN");
const touchCatalog = () => {
  try {
    revalidateTag("catalog");
  } catch {
    /* outside a Next request (scripts/tests) */
  }
};

export const COURSE_EDITABLE_FIELDS = ["title", "subtitle", "description", "requirements", "outcomes", "category_id", "level", "delivery",
  "language", "thumbnail_url", "estimated_hours", "instructor_id", "certificate_enabled", "min_attendance_percent", "enrollment_open",
  "enrollment_capacity", "enrollment_starts_at", "enrollment_ends_at", "access_days", "preview_video_asset_id"] as const;
export const LESSON_EDITABLE_FIELDS = ["title", "summary", "body", "kind", "video_asset_id", "duration_seconds", "is_preview", "is_required"] as const;
export const MODULE_EDITABLE_FIELDS = ["title", "description"] as const;

function pick<T extends Record<string, unknown>>(obj: T, keys: readonly string[]) {
  return Object.fromEntries(Object.entries(obj).filter(([k, v]) => keys.includes(k) && v !== undefined));
}

export async function createCourse(actor: Actor, input: { title: string; subtitle?: string; categoryId: string; delivery: string; level: string }) {
  const slug = `${slugify(input.title)}-${randomCode(4).toLowerCase()}`;
  const [c] = await asUser(actor, (tx) => tx`
    insert into public.courses (slug, title, subtitle, category_id, delivery, level, status, created_by)
    values (${slug}, ${input.title}, ${input.subtitle ?? ""}, ${input.categoryId}, ${input.delivery}, ${input.level}, 'DRAFT', ${actor.id})
    returning id`);
  await audit({ actorId: actor.id, actorRole: actor.roles[0], action: "course.create", entityType: "course", entityId: c.id as string });
  return c.id as string;
}

/**
 * Edits course details. Draft/rejected courses are edited directly (RLS: assigned CM or SA).
 * For live (published/approved/in-review) courses, a Content Manager's change becomes a
 * controlled revision that a Super Admin must approve.
 */
export async function updateCourseDetails(actor: Actor, courseId: string, fields: Record<string, unknown>) {
  const data = pick(fields, COURSE_EDITABLE_FIELDS);
  if (!Object.keys(data).length) return { mode: "noop" as const };
  const [c] = await asUser(actor, (tx) => tx`select status, public.manages_course(id) as manages from public.courses where id = ${courseId}`);
  if (!c?.manages) throw new Error("Not allowed.");
  if (!isSA(actor) && !["DRAFT", "REJECTED"].includes(c.status as string)) {
    const id = await proposeRevision(actor, courseId, "course", courseId, data);
    return { mode: "revision" as const, revisionId: id };
  }
  await asUser(actor, (tx) => tx`update public.courses set ${tx(data as Record<string, never>)} where id = ${courseId}`);
  await audit({ actorId: actor.id, actorRole: actor.roles[0], action: "course.update", entityType: "course", entityId: courseId, metadata: { fields: Object.keys(data) } });
  touchCatalog();
  return { mode: "direct" as const };
}

/** Super Admin only — enforced by RLS policy + guard trigger as well. */
export async function updatePricing(actor: Actor, courseId: string, p: { isFree: boolean; pricePaise: number; compareAtPaise: number | null }) {
  if (!isSA(actor)) throw new Error("Only a Super Admin can change pricing.");
  await asUser(actor, (tx) => tx`update public.courses set is_free = ${p.isFree}, price_paise = ${p.isFree ? 0 : p.pricePaise},
                                compare_at_price_paise = ${p.isFree ? null : p.compareAtPaise} where id = ${courseId}`);
  await audit({ actorId: actor.id, actorRole: "SUPER_ADMIN", action: "course.pricing", entityType: "course", entityId: courseId, metadata: p });
  touchCatalog();
}

export async function submitForReview(actor: Actor, courseId: string, note: string) {
  await asUser(actor, async (tx) => {
    const [c] = await tx`update public.courses set status = 'REVIEW' where id = ${courseId} and status in ('DRAFT','REJECTED') returning title`;
    if (!c) throw new Error("Only draft or rejected courses can be submitted.");
    await tx`insert into public.approval_requests (course_id, kind, requested_by, note) values (${courseId}, 'COURSE_PUBLISH', ${actor.id}, ${note})`;
  });
  await audit({ actorId: actor.id, actorRole: actor.roles[0], action: "course.submit", entityType: "course", entityId: courseId, metadata: { note } });
  await notifySuperAdmins({ kind: "APPROVAL", title: "Course submitted for review", body: note, link: `/admin/approvals` });
}

export async function decideCourse(actor: Actor, courseId: string, decision: "approve" | "reject" | "publish", comment: string) {
  if (!isSA(actor)) throw new Error("Only a Super Admin can approve or publish courses.");
  const c = await asUser(actor, async (tx) => {
    const [c] = await tx`select status, title, created_by from public.courses where id = ${courseId} for update`;
    if (!c) throw new Error("Course not found");
    if (decision === "reject") {
      await tx`update public.courses set status = 'REJECTED' where id = ${courseId}`;
    } else if (decision === "approve") {
      await tx`update public.courses set status = 'APPROVED' where id = ${courseId}`;
    } else {
      await tx`update public.courses set status = 'PUBLISHED', published_at = coalesce(published_at, now()), archived_at = null where id = ${courseId}`;
    }
    await tx`update public.approval_requests set status = ${decision === "reject" ? "REJECTED" : "APPROVED"}, decided_by = ${actor.id},
             decision_comment = ${comment}, decided_at = now() where course_id = ${courseId} and kind = 'COURSE_PUBLISH' and status = 'PENDING'`;
    return c;
  });
  if (c.created_by && c.created_by !== actor.id) await notify(c.created_by as string, {
    kind: "APPROVAL", title: `Course ${decision === "reject" ? "returned with feedback" : decision === "approve" ? "approved" : "published"}: ${c.title}`,
    body: comment, link: `/admin/courses/${courseId}`,
  });
  await audit({ actorId: actor.id, actorRole: "SUPER_ADMIN", action: `course.${decision}`, entityType: "course", entityId: courseId, metadata: { comment } });
  touchCatalog();
}

export async function archiveCourse(actor: Actor, courseId: string, archive: boolean) {
  if (!isSA(actor)) throw new Error("Only a Super Admin can archive courses.");
  await asUser(actor, (tx) => archive
    ? tx`update public.courses set status = 'ARCHIVED', archived_at = now() where id = ${courseId}`
    : tx`update public.courses set status = 'DRAFT', archived_at = null where id = ${courseId}`);
  await audit({ actorId: actor.id, actorRole: "SUPER_ADMIN", action: archive ? "course.archive" : "course.unarchive", entityType: "course", entityId: courseId });
  touchCatalog();
}

// ── structure ──────────────────────────────────────────────────────────────
export async function addModule(actor: Actor, courseId: string, title: string) {
  const [m] = await asUser(actor, (tx) => tx`
    insert into public.course_modules (course_id, title, position)
    values (${courseId}, ${title}, coalesce((select max(position) + 1 from public.course_modules where course_id = ${courseId}), 0))
    returning id`);
  await audit({ actorId: actor.id, action: "module.create", entityType: "course", entityId: courseId });
  return m.id as string;
}

export async function addLesson(actor: Actor, moduleId: string, input: { title: string; kind: string }) {
  const [l] = await asUser(actor, (tx) => tx`
    insert into public.lessons (course_id, module_id, title, kind, position)
    select m.course_id, m.id, ${input.title}, ${input.kind}, coalesce((select max(position) + 1 from public.lessons where module_id = m.id), 0)
    from public.course_modules m where m.id = ${moduleId}
    returning id, course_id`);
  if (!l) throw new Error("Module not found or not editable.");
  await audit({ actorId: actor.id, action: "lesson.create", entityType: "lesson", entityId: l.id as string });
  return l.id as string;
}

export async function updateLesson(actor: Actor, lessonId: string, fields: Record<string, unknown>) {
  const data = pick(fields, LESSON_EDITABLE_FIELDS);
  const [l] = await asUser(actor, (tx) => tx`select l.course_id, c.status, public.manages_course(l.course_id) as manages
                                             from public.lessons l join public.courses c on c.id = l.course_id where l.id = ${lessonId}`);
  if (!l?.manages) throw new Error("Not allowed.");
  if (!isSA(actor) && !["DRAFT", "REJECTED"].includes(l.status as string)) {
    return { mode: "revision" as const, revisionId: await proposeRevision(actor, l.course_id as string, "lesson", lessonId, data) };
  }
  await asUser(actor, (tx) => tx`update public.lessons set ${tx(data as Record<string, never>)} where id = ${lessonId}`);
  await audit({ actorId: actor.id, action: "lesson.update", entityType: "lesson", entityId: lessonId, metadata: { fields: Object.keys(data) } });
  return { mode: "direct" as const };
}

export async function deleteNode(actor: Actor, kind: "module" | "lesson", id: string) {
  const rows = await asUser(actor, (tx) => kind === "module"
    ? tx`delete from public.course_modules where id = ${id} returning id`
    : tx`delete from public.lessons where id = ${id} returning id`);
  if (!rows[0]) throw new Error("Not allowed — published content can only be changed through a revision.");
  await audit({ actorId: actor.id, action: `${kind}.delete`, entityType: kind, entityId: id });
}

export async function moveNode(actor: Actor, kind: "module" | "lesson", id: string, dir: -1 | 1) {
  await asUser(actor, async (tx) => {
    const table = kind === "module" ? tx`public.course_modules` : tx`public.lessons`;
    const parent = kind === "module" ? tx`course_id` : tx`module_id`;
    const [cur] = await tx`select id, position, ${parent} as parent from ${table} where id = ${id}`;
    if (!cur) return;
    const [swap] = await tx`select id, position from ${table} where ${parent} = ${cur.parent}
                            and position ${dir < 0 ? tx`<` : tx`>`} ${cur.position} order by position ${dir < 0 ? tx`desc` : tx`asc`} limit 1`;
    if (!swap) return;
    await tx`update ${table} set position = ${swap.position} where id = ${cur.id}`;
    await tx`update ${table} set position = ${cur.position} where id = ${swap.id}`;
  });
}

// ── revisions ──────────────────────────────────────────────────────────────
export async function proposeRevision(actor: Actor, courseId: string, entityType: "course" | "lesson" | "module", entityId: string, payload: Record<string, unknown>) {
  const [r] = await asUser(actor, (tx) => tx`
    insert into public.content_revisions (course_id, entity_type, entity_id, payload, status, author_id)
    values (${courseId}, ${entityType}, ${entityId}, ${tx.json(payload as never)}, 'REVIEW', ${actor.id}) returning id`);
  await asUser(actor, (tx) => tx`insert into public.approval_requests (course_id, revision_id, kind, requested_by, note)
                                 values (${courseId}, ${r.id}, 'REVISION', ${actor.id}, ${`Changes to ${entityType}: ${Object.keys(payload).join(", ")}`})`);
  await audit({ actorId: actor.id, action: "revision.propose", entityType: "content_revision", entityId: r.id as string });
  await notifySuperAdmins({ kind: "APPROVAL", title: "Content revision awaiting review", link: "/admin/approvals" });
  return r.id as string;
}

export async function decideRevision(actor: Actor, revisionId: string, approve: boolean, comment: string) {
  if (!isSA(actor)) throw new Error("Only a Super Admin can approve revisions.");
  await asService(async (tx) => {
    const [r] = await tx`select * from public.content_revisions where id = ${revisionId} and status = 'REVIEW' for update`;
    if (!r) throw new Error("Revision is not pending.");
    if (approve) {
      const allowed = r.entity_type === "course" ? COURSE_EDITABLE_FIELDS : r.entity_type === "lesson" ? LESSON_EDITABLE_FIELDS : MODULE_EDITABLE_FIELDS;
      const data = pick(r.payload as Record<string, unknown>, allowed);
      const table = r.entity_type === "course" ? tx`public.courses` : r.entity_type === "lesson" ? tx`public.lessons` : tx`public.course_modules`;
      if (Object.keys(data).length) await tx`update ${table} set ${tx(data as Record<string, never>)} where id = ${r.entity_id}`;
    }
    await tx`update public.content_revisions set status = ${approve ? "APPLIED" : "REJECTED"}, reviewer_id = ${actor.id},
             reviewer_comment = ${comment}, applied_at = ${approve ? new Date() : null} where id = ${revisionId}`;
    await tx`update public.approval_requests set status = ${approve ? "APPROVED" : "REJECTED"}, decided_by = ${actor.id},
             decision_comment = ${comment}, decided_at = now() where revision_id = ${revisionId} and status = 'PENDING'`;
    if (r.author_id) await notify(r.author_id as string, { kind: "APPROVAL", title: `Revision ${approve ? "applied" : "rejected"}`, body: comment, link: `/admin/courses/${r.course_id}` }, tx);
    await audit({ actorId: actor.id, actorRole: "SUPER_ADMIN", action: approve ? "revision.apply" : "revision.reject", entityType: "content_revision", entityId: revisionId }, tx);
  });
  touchCatalog();
}

export async function setManagerAssignment(actor: Actor, courseId: string, userId: string, assign: boolean) {
  if (!isSA(actor)) throw new Error("Only a Super Admin can assign Content Managers.");
  await asUser(actor, (tx) => assign
    ? tx`insert into public.content_manager_assignments (user_id, course_id, assigned_by) values (${userId}, ${courseId}, ${actor.id}) on conflict do nothing`
    : tx`delete from public.content_manager_assignments where user_id = ${userId} and course_id = ${courseId}`);
  await audit({ actorId: actor.id, actorRole: "SUPER_ADMIN", action: assign ? "cm.assign" : "cm.unassign", entityType: "course", entityId: courseId, metadata: { userId } });
  if (assign) await notify(userId, { kind: "INFO", title: "You were assigned to a course", link: `/admin/courses/${courseId}` });
}
