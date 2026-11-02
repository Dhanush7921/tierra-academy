"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { asService, asUser, isPermissionError } from "@/lib/db/client";
import { requirePermission, revokeAllSessions } from "@/lib/auth/session";
import type { Permission } from "@/lib/rbac";
import {
  addLesson, addModule, archiveCourse, createCourse, decideCourse, decideRevision, deleteNode, moveNode, setManagerAssignment,
  submitForReview, updateCourseDetails, updateLesson, updatePricing,
} from "@/lib/services/courses-admin";
import { decideSession, proposeSession, setSessionStatus, syncZoomAttendance } from "@/lib/services/live";
import { decideRefund } from "@/lib/services/payments";
import { createInvitation, revokeInvitation } from "@/lib/services/invitations";
import { grantEnrollment } from "@/lib/services/enrollment";
import { issueCertificateIfEligible } from "@/lib/services/learning";
import { createUserWithPassword } from "@/lib/auth/provider";
import { putFile, validateUpload, MAX_UPLOAD_BYTES } from "@/lib/providers/storage";
import { audit } from "@/lib/services/audit";
import { notify } from "@/lib/services/notifications";
import {
  assignmentSchema, couponSchema, courseCreateSchema, courseDetailsSchema, lessonSchema, liveSchema, password as pwSchema,
  pricingSchema, questionSchema, quizSchema, email as emailSchema,
} from "@/lib/validation";

/** Redirect back with a flash message (?ok= / ?err=). */
function back(path: string, kind: "ok" | "err", msg: string): never {
  const sep = path.includes("?") ? "&" : "?";
  redirect(`${path}${sep}${kind}=${encodeURIComponent(msg)}`);
}

async function run(permission: Permission, path: string, fn: (u: Awaited<ReturnType<typeof requirePermission>>) => Promise<string | void>) {
  const user = await requirePermission(permission);
  let msg: string | void;
  try {
    msg = await fn(user);
  } catch (e) {
    if ((e as { digest?: string })?.digest?.startsWith?.("NEXT_REDIRECT")) throw e;
    const m = isPermissionError(e) ? "Not allowed: your role cannot make this change." : (e as Error).message || "Something went wrong.";
    back(path, "err", m.slice(0, 200));
  }
  revalidatePath("/admin", "layout");
  back(path, "ok", msg || "Saved.");
}

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "");
const actor = (u: { id: string; email: string; roles: string[] }) => ({ id: u.id, email: u.email, roles: u.roles });

// ── courses ──────────────────────────────────────────────────────────────────
export async function createCourseAction(fd: FormData) {
  const user = await requirePermission("course.create");
  const p = courseCreateSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) back("/admin/courses/new", "err", p.error.issues[0].message);
  let id: string;
  try { id = await createCourse(actor(user), p.data); } catch (e) { back("/admin/courses/new", "err", (e as Error).message); }
  redirect(`/admin/courses/${id}?ok=${encodeURIComponent("Draft created. Add modules and lessons next.")}`);
}

export async function updateCourseAction(courseId: string, fd: FormData) {
  await run("course.editAssigned", `/admin/courses/${courseId}`, async (u) => {
    const p = courseDetailsSchema.safeParse(Object.fromEntries(fd));
    if (!p.success) throw new Error(`${p.error.issues[0].path.join(".")}: ${p.error.issues[0].message}`);
    const thumb = fd.get("thumbnail");
    const data: Record<string, unknown> = { ...p.data };
    if (thumb instanceof File && thumb.size > 0) {
      const buf = Buffer.from(await thumb.arrayBuffer());
      const kind = validateUpload(buf, ["image/png", "image/jpeg", "image/webp"], MAX_UPLOAD_BYTES.image);
      const stored = await putFile("public", `thumbnails/${courseId}`, buf, kind.mime, kind.ext);
      data.thumbnail_url = stored.publicUrl;
    }
    const r = await updateCourseDetails(actor(u), courseId, data);
    return r.mode === "revision" ? "This course is live — your changes were submitted as a revision for Super Admin approval." : "Course details saved.";
  });
}

export async function pricingAction(courseId: string, fd: FormData) {
  await run("course.pricing", `/admin/courses/${courseId}?tab=pricing`, async (u) => {
    const p = pricingSchema.safeParse(Object.fromEntries(fd));
    if (!p.success) throw new Error(p.error.issues[0].message);
    await updatePricing(actor(u), courseId, { isFree: p.data.isFree, pricePaise: Math.round(p.data.price * 100), compareAtPaise: p.data.compareAt });
    return "Pricing updated.";
  });
}

export async function submitReviewAction(courseId: string, fd: FormData) {
  await run("course.submitForReview", `/admin/courses/${courseId}`, async (u) => { await submitForReview(actor(u), courseId, s(fd, "note").slice(0, 1000)); return "Submitted for review."; });
}

export async function decideCourseAction(courseId: string, decision: "approve" | "reject" | "publish", fd: FormData) {
  const from = s(fd, "from") || `/admin/courses/${courseId}`;
  await run("course.approve", from, async (u) => {
    if (decision === "reject" && !s(fd, "comment").trim()) throw new Error("Add a comment explaining what needs to change.");
    await decideCourse(actor(u), courseId, decision, s(fd, "comment").slice(0, 2000));
    return decision === "publish" ? "Course published." : decision === "approve" ? "Course approved." : "Course returned to the author.";
  });
}

export async function archiveCourseAction(courseId: string, archive: boolean) {
  await run("course.archive", `/admin/courses/${courseId}`, async (u) => { await archiveCourse(actor(u), courseId, archive); return archive ? "Course archived." : "Course restored as draft."; });
}

export async function assignManagerAction(courseId: string, fd: FormData) {
  await run("course.assignManagers", `/admin/courses/${courseId}?tab=team`, async (u) => {
    await setManagerAssignment(actor(u), courseId, s(fd, "userId"), s(fd, "assign") === "1");
    return "Assignments updated.";
  });
}

// ── curriculum ───────────────────────────────────────────────────────────────
export async function addModuleAction(courseId: string, fd: FormData) {
  await run("course.editAssigned", `/admin/courses/${courseId}?tab=curriculum`, async (u) => {
    const title = s(fd, "title").trim();
    if (title.length < 2) throw new Error("Module title is required.");
    await addModule(actor(u), courseId, title.slice(0, 200));
    return "Module added.";
  });
}

export async function addLessonAction(courseId: string, moduleId: string, fd: FormData) {
  await run("course.editAssigned", `/admin/courses/${courseId}?tab=curriculum`, async (u) => {
    const title = s(fd, "title").trim();
    if (title.length < 2) throw new Error("Lesson title is required.");
    await addLesson(actor(u), moduleId, { title: title.slice(0, 200), kind: s(fd, "kind") || "VIDEO" });
    return "Lesson added.";
  });
}

export async function updateLessonAction(courseId: string, lessonId: string, fd: FormData) {
  await run("course.editAssigned", `/admin/courses/${courseId}?tab=curriculum`, async (u) => {
    const p = lessonSchema.safeParse(Object.fromEntries(fd));
    if (!p.success) throw new Error(p.error.issues[0].message);
    const r = await updateLesson(actor(u), lessonId, p.data);
    const file = fd.get("resource");
    if (file instanceof File && file.size > 0) {
      const buf = Buffer.from(await file.arrayBuffer());
      const kind = validateUpload(buf, ["application/pdf", "image/png", "image/jpeg", "application/zip"], MAX_UPLOAD_BYTES.document);
      const stored = await putFile("private", `resources/${courseId}`, buf, kind.mime, kind.ext);
      await asUser(u, (tx) => tx`insert into public.lesson_resources (lesson_id, course_id, title, storage_provider, storage_key, mime_type, size_bytes, uploaded_by)
        values (${lessonId}, ${courseId}, ${s(fd, "resourceTitle") || file.name.replace(/\.[^.]+$/, "")}, ${stored.provider}, ${stored.key}, ${kind.mime}, ${buf.length}, ${u.id})`);
    }
    return r.mode === "revision" ? "Submitted as a revision for approval (course is live)." : "Lesson saved.";
  });
}

export async function deleteNodeAction(courseId: string, kind: "module" | "lesson", id: string) {
  await run("course.editAssigned", `/admin/courses/${courseId}?tab=curriculum`, async (u) => { await deleteNode(actor(u), kind, id); return `${kind === "module" ? "Module" : "Lesson"} deleted.`; });
}

export async function moveNodeAction(courseId: string, kind: "module" | "lesson", id: string, dir: -1 | 1) {
  await run("course.editAssigned", `/admin/courses/${courseId}?tab=curriculum`, async (u) => { await moveNode(actor(u), kind, id, dir); return "Order updated."; });
}

export async function deleteResourceAction(courseId: string, id: string) {
  await run("course.editAssigned", `/admin/courses/${courseId}?tab=curriculum`, async (u) => {
    const r = await asUser(u, (tx) => tx`delete from public.lesson_resources where id = ${id} returning id`);
    if (!r[0]) throw new Error("Not allowed.");
    return "Resource removed.";
  });
}

// ── assessments ──────────────────────────────────────────────────────────────
export async function createQuizAction(courseId: string, fd: FormData) {
  await run("quiz.manage", `/admin/courses/${courseId}?tab=assessments`, async (u) => {
    const p = quizSchema.safeParse(Object.fromEntries(fd));
    if (!p.success) throw new Error(p.error.issues[0].message);
    await asUser(u, (tx) => tx`insert into public.quizzes (course_id, title, pass_percent, max_attempts, is_required, created_by)
      values (${courseId}, ${p.data.title}, ${p.data.passPercent}, ${p.data.maxAttempts}, ${p.data.isRequired}, ${u.id})`);
    return "Quiz created.";
  });
}

export async function addQuestionAction(courseId: string, quizId: string, fd: FormData) {
  await run("quiz.manage", `/admin/courses/${courseId}?tab=assessments`, async (u) => {
    const raw = Object.fromEntries(fd) as Record<string, string>;
    const p = questionSchema.safeParse({ ...raw, correctIndex: String(Number(raw.correctIndexHuman ?? raw.correctIndex ?? 1) - 1) });
    if (!p.success) throw new Error(p.error.issues[0].message);
    await asUser(u, (tx) => tx`insert into public.questions (quiz_id, prompt, options, correct_index, explanation, position)
      values (${quizId}, ${p.data.prompt}, ${tx.json(p.data.options)}, ${p.data.correctIndex}, ${p.data.explanation},
              coalesce((select max(position) + 1 from public.questions where quiz_id = ${quizId}), 0))`);
    return "Question added.";
  });
}

export async function deleteQuestionAction(courseId: string, id: string) {
  await run("quiz.manage", `/admin/courses/${courseId}?tab=assessments`, async (u) => {
    const r = await asUser(u, (tx) => tx`delete from public.questions where id = ${id} returning id`);
    if (!r[0]) throw new Error("Not allowed.");
    return "Question deleted.";
  });
}

export async function createAssignmentAction(courseId: string, fd: FormData) {
  await run("quiz.manage", `/admin/courses/${courseId}?tab=assessments`, async (u) => {
    const p = assignmentSchema.safeParse(Object.fromEntries(fd));
    if (!p.success) throw new Error(p.error.issues[0].message);
    if (p.data.passPoints > p.data.maxPoints) throw new Error("Pass points cannot exceed max points.");
    await asUser(u, (tx) => tx`insert into public.assignments (course_id, title, instructions, due_at, max_points, pass_points, is_required, created_by)
      values (${courseId}, ${p.data.title}, ${p.data.instructions}, ${p.data.dueAt}, ${p.data.maxPoints}, ${p.data.passPoints}, ${p.data.isRequired}, ${u.id})`);
    return "Assignment created.";
  });
}

export async function gradeAction(submissionId: string, fd: FormData) {
  await run("assignment.grade", "/admin/submissions", async (u) => {
    const points = z.coerce.number().int().min(0).max(1000).parse(fd.get("points"));
    const feedback = s(fd, "feedback").slice(0, 4000);
    const [row] = await asUser(u, (tx) => tx`update public.submissions sb set points = ${points}, feedback = ${feedback}, status = 'GRADED', graded_by = ${u.id}, graded_at = now()
      from public.assignments a where sb.id = ${submissionId} and a.id = sb.assignment_id and ${points} <= a.max_points
      returning sb.user_id, a.course_id, a.title`);
    if (!row) throw new Error("Not allowed or points exceed the maximum.");
    await notify(row.user_id as string, { kind: "ASSIGNMENT", title: `Graded: ${row.title}`, body: `${points} points`, link: "/dashboard/assignments", email: true });
    await issueCertificateIfEligible(row.user_id as string, row.course_id as string);
    await audit({ actorId: u.id, action: "submission.grade", entityType: "submission", entityId: submissionId, metadata: { points } });
    return "Grade saved and the student was notified.";
  });
}

// ── approvals ────────────────────────────────────────────────────────────────
export async function decideRevisionAction(revisionId: string, approve: boolean, fd: FormData) {
  await run("course.approve", "/admin/approvals", async (u) => { await decideRevision(actor(u), revisionId, approve, s(fd, "comment")); return approve ? "Revision applied." : "Revision rejected."; });
}

// ── live ─────────────────────────────────────────────────────────────────────
export async function proposeLiveAction(fd: FormData) {
  await run("live.propose", "/admin/live", async (u) => {
    const p = liveSchema.safeParse(Object.fromEntries(fd));
    if (!p.success) throw new Error(p.error.issues[0].message);
    await proposeSession(actor(u), p.data);
    return u.roles.includes("SUPER_ADMIN") ? "Live class scheduled." : "Live class proposed — awaiting Super Admin approval.";
  });
}

export async function decideLiveAction(sessionId: string, approve: boolean, fd: FormData) {
  await run("live.approve", s(fd, "from") || "/admin/live", async (u) => { await decideSession(actor(u), sessionId, approve, s(fd, "comment")); return approve ? "Session approved and scheduled." : "Session rejected."; });
}

export async function liveStatusAction(sessionId: string, status: "LIVE" | "ENDED" | "CANCELLED") {
  await run("live.host", `/admin/live/${sessionId}`, async (u) => { await setSessionStatus(actor(u), sessionId, status); return `Session ${status.toLowerCase()}.`; });
}

export async function attachRecordingAction(sessionId: string, fd: FormData) {
  await run("live.host", `/admin/live/${sessionId}`, async (u) => {
    const assetId = s(fd, "assetId");
    const r = await asUser(u, (tx) => tx`update public.live_sessions set recording_video_asset_id = ${assetId}, recording_status = 'IMPORTED' where id = ${sessionId} returning course_id, title`);
    if (!r[0]) throw new Error("Not allowed.");
    return "Recording attached. Add it to a lesson so enrolled students can watch it.";
  });
}

export async function syncAttendanceAction(sessionId: string) {
  await run("live.host", `/admin/live/${sessionId}`, async () => `${await syncZoomAttendance(sessionId)} attendance records imported from Zoom.`);
}

// ── invitations ──────────────────────────────────────────────────────────────
export async function createInvitationAction(fd: FormData) {
  const user = await requirePermission("invitation.create");
  const complimentary = fd.get("complimentary") === "on";
  if (complimentary && !user.roles.includes("SUPER_ADMIN")) back("/admin/invitations", "err", "Only a Super Admin can grant complimentary access.");
  const email = s(fd, "email").trim();
  if (email && !emailSchema.safeParse(email).success) back("/admin/invitations", "err", "Invalid email.");
  let res: Awaited<ReturnType<typeof createInvitation>>;
  try {
    res = await createInvitation(actor(user), {
      courseId: s(fd, "courseId") || null, liveSessionId: s(fd, "liveSessionId") || null, email: email || null, grantsComplimentary: complimentary,
      maxUses: Math.min(1000, Math.max(1, Number(s(fd, "maxUses")) || 1)), expiresInDays: Number(s(fd, "days")) || 14, note: s(fd, "note") || undefined,
    });
  } catch (e) {
    back("/admin/invitations", "err", isPermissionError(e) ? "Not allowed for this course." : (e as Error).message);
  }
  revalidatePath("/admin/invitations");
  redirect(`/admin/invitations?link=${encodeURIComponent(res.link)}&wa=${encodeURIComponent(res.whatsapp)}`);
}

export async function revokeInvitationAction(id: string) {
  await run("invitation.create", "/admin/invitations", async (u) => { if (!(await revokeInvitation(actor(u), id))) throw new Error("Not allowed."); return "Invitation revoked."; });
}

// ── orders / refunds / coupons ───────────────────────────────────────────────
export async function decideRefundAction(refundId: string, approve: boolean, fd: FormData) {
  await run("refunds.issue", "/admin/orders?tab=refunds", async (u) => {
    const r = await decideRefund(u, refundId, approve, s(fd, "note"));
    if (!r.ok) throw new Error(r.error);
    return approve ? "Refund approved and processed." : "Refund declined.";
  });
}

export async function adminRefundOrderAction(orderId: string, fd: FormData) {
  await run("refunds.issue", "/admin/orders", async (u) => {
    const [o] = await asService((tx) => tx`select user_id, amount_paise from public.orders where id = ${orderId} and status = 'PAID'`);
    if (!o) throw new Error("Only paid orders can be refunded.");
    const [p] = await asService((tx) => tx`select id from public.payments where order_id = ${orderId} and status = 'CAPTURED' limit 1`);
    const [r] = await asService((tx) => tx`insert into public.refunds (order_id, payment_id, user_id, amount_paise, reason, requested_by)
      values (${orderId}, ${p?.id ?? null}, ${o.user_id}, ${o.amount_paise}, ${s(fd, "reason") || "Issued by admin"}, ${u.id}) returning id`);
    const res = await decideRefund(u, r.id as string, true, s(fd, "reason") || "Issued by admin");
    if (!res.ok) throw new Error(res.error);
    return "Refund issued.";
  });
}

export async function createCouponAction(fd: FormData) {
  await run("coupons.manage", "/admin/coupons", async (u) => {
    const p = couponSchema.safeParse(Object.fromEntries(fd));
    if (!p.success) throw new Error(p.error.issues[0].message);
    const value = p.data.kind === "FLAT" ? Math.round(p.data.value * 100) : Math.round(p.data.value);
    await asUser(u, (tx) => tx`insert into public.coupons (code, kind, value, course_id, max_redemptions, valid_until, created_by)
      values (${p.data.code}, ${p.data.kind}, ${value}, ${p.data.courseId}, ${p.data.maxRedemptions}, ${p.data.validUntil}, ${u.id})`);
    await audit({ actorId: u.id, actorRole: "SUPER_ADMIN", action: "coupon.create", entityType: "coupon", entityId: p.data.code });
    return `Coupon ${p.data.code} created.`;
  });
}

export async function toggleCouponAction(id: string, active: boolean) {
  await run("coupons.manage", "/admin/coupons", async (u) => { await asUser(u, (tx) => tx`update public.coupons set is_active = ${active} where id = ${id}`); return active ? "Coupon activated." : "Coupon deactivated."; });
}

// ── users & team ─────────────────────────────────────────────────────────────
export async function setDisabledAction(userId: string, disabled: boolean) {
  await run("users.manage", "/admin/users", async (u) => {
    if (userId === u.id) throw new Error("You cannot disable your own account.");
    const [t] = await asService((tx) => tx`select exists (select 1 from public.user_roles where user_id = ${userId} and role = 'SUPER_ADMIN') as sa`);
    if (t.sa) throw new Error("Super Admin accounts cannot be disabled here.");
    await asUser(u, (tx) => tx`update public.profiles set is_disabled = ${disabled} where id = ${userId}`);
    await revokeAllSessions(userId);
    await audit({ actorId: u.id, actorRole: "SUPER_ADMIN", action: disabled ? "user.disable" : "user.enable", entityType: "profile", entityId: userId });
    return disabled ? "Account disabled and signed out." : "Account re-enabled.";
  });
}

export async function setRoleAction(userId: string, role: "CONTENT_MANAGER", grant: boolean, from = "/admin/team") {
  await run("team.manage", from, async (u) => {
    await asUser(u, (tx) => grant
      ? tx`insert into public.user_roles (user_id, role, granted_by) values (${userId}, ${role}, ${u.id}) on conflict do nothing`
      : tx`delete from public.user_roles where user_id = ${userId} and role = ${role}`);
    if (!grant) await asService((tx) => tx`delete from public.content_manager_assignments where user_id = ${userId}`);
    await revokeAllSessions(userId);
    await audit({ actorId: u.id, actorRole: "SUPER_ADMIN", action: grant ? "role.grant" : "role.revoke", entityType: "profile", entityId: userId, metadata: { role } });
    return grant ? "Content Manager role granted." : "Content Manager role removed.";
  });
}

export async function createContentManagerAction(fd: FormData) {
  await run("team.manage", "/admin/team", async (u) => {
    const email = emailSchema.parse(fd.get("email"));
    const name = z.string().trim().min(2).max(120).parse(fd.get("fullName"));
    const [existing] = await asService((tx) => tx`select id from public.profiles where email = ${email}`);
    let id = existing?.id as string | undefined;
    if (!id) {
      const pw = pwSchema.safeParse(fd.get("password"));
      if (!pw.success) throw new Error(`Temporary password: ${pw.error.issues[0].message}`);
      const r = await createUserWithPassword(email, pw.data, name);
      if (!r.ok) throw new Error(r.error);
      id = r.userId;
    }
    await asUser(u, (tx) => tx`insert into public.user_roles (user_id, role, granted_by) values (${id}, 'CONTENT_MANAGER', ${u.id}) on conflict do nothing`);
    await audit({ actorId: u.id, actorRole: "SUPER_ADMIN", action: "team.add_cm", entityType: "profile", entityId: id });
    await notify(id!, { kind: "INFO", title: "You were added as a Content Manager", body: "Sign in to the admin panel to start creating course drafts.", link: "/admin", email: true });
    return existing ? "Existing user promoted to Content Manager." : "Content Manager account created. Share the temporary password securely and ask them to change it.";
  });
}

export async function grantEnrollmentAction(fd: FormData) {
  await run("users.manage", "/admin/users", async (u) => {
    const userId = s(fd, "userId"), courseId = s(fd, "courseId");
    await asService(async (tx) => {
      await grantEnrollment(tx, { userId, courseId, source: "ADMIN", grantedBy: u.id });
      await audit({ actorId: u.id, actorRole: "SUPER_ADMIN", action: "enrollment.grant", entityType: "enrollment", metadata: { userId, courseId } }, tx);
    });
    await notify(userId, { kind: "ENROLLMENT", title: "A course was added to your account", link: "/dashboard/courses" });
    return "Enrollment granted.";
  });
}

export async function handleDataRequestAction(id: string, status: "COMPLETED" | "REJECTED") {
  await run("users.manage", "/admin/users?tab=privacy", async (u) => {
    const [r] = await asUser(u, (tx) => tx`update public.data_requests set status = ${status}, handled_by = ${u.id}, handled_at = now() where id = ${id} returning user_id, kind`);
    if (r?.kind === "DELETE" && status === "COMPLETED") {
      // soft-delete + anonymise; payment/order records are retained for legal/accounting reasons
      await asService(async (tx) => {
        await tx`update public.profiles set deleted_at = now(), is_disabled = true, full_name = 'Deleted user', phone = null, city = null, bio = null, avatar_url = null,
                 email = ${`deleted-${r.user_id}@deleted.invalid`}, session_version = session_version + 1 where id = ${r.user_id}`;
        await tx`delete from public.local_credentials where user_id = ${r.user_id}`;
        await tx`delete from public.notifications where user_id = ${r.user_id}`;
        await tx`delete from public.live_session_messages where user_id = ${r.user_id}`;
      });
    }
    await audit({ actorId: u.id, actorRole: "SUPER_ADMIN", action: `privacy.${String(r?.kind).toLowerCase()}_${status.toLowerCase()}`, entityType: "data_request", entityId: id });
    return "Request updated.";
  });
}

// ── certificates & settings ──────────────────────────────────────────────────
export async function revokeCertificateAction(id: string, revoke: boolean, fd: FormData) {
  await run("certificates.manage", "/admin/certificates", async (u) => {
    await asUser(u, (tx) => tx`update public.certificates set revoked_at = ${revoke ? new Date() : null}, revoke_reason = ${revoke ? s(fd, "reason") || "Revoked by admin" : null} where id = ${id}`);
    await audit({ actorId: u.id, actorRole: "SUPER_ADMIN", action: revoke ? "certificate.revoke" : "certificate.restore", entityType: "certificate", entityId: id });
    return revoke ? "Certificate revoked." : "Certificate restored.";
  });
}

export async function evaluateCertificateAction(fd: FormData) {
  await run("certificates.manage", "/admin/certificates", async (u) => {
    const id = await issueCertificateIfEligible(s(fd, "userId"), s(fd, "courseId"), u.id);
    if (!id) throw new Error("Requirements are not yet satisfied for this student — no certificate issued.");
    return "Certificate issued.";
  });
}

export async function saveSettingsAction(fd: FormData) {
  await run("settings.manage", "/admin/settings", async (u) => {
    const support = { email: emailSchema.parse(fd.get("supportEmail")), phone: s(fd, "supportPhone").slice(0, 30), whatsapp: s(fd, "supportWhatsapp").slice(0, 30) };
    await asUser(u, (tx) => tx`insert into public.platform_settings (key, value, updated_by) values ('support', ${tx.json(support)}, ${u.id})
      on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now()`);
    await audit({ actorId: u.id, actorRole: "SUPER_ADMIN", action: "settings.update", entityType: "settings", entityId: "support" });
    return "Settings saved.";
  });
}

export async function markContactHandledAction(id: string) {
  await run("settings.manage", "/admin/settings", async (u) => { await asUser(u, (tx) => tx`update public.contact_messages set handled_at = now() where id = ${id}`); return "Marked as handled."; });
}
