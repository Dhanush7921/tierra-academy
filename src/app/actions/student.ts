"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { asService, asUser } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/session";
import { changePassword } from "@/lib/auth/provider";
import { password as passwordSchema, zodErrors, type FormState } from "@/lib/validation";
import { submitQuiz } from "@/lib/services/learning";
import { requestRefund } from "@/lib/services/payments";
import { putFile, validateUpload } from "@/lib/providers/storage";
import { audit } from "@/lib/services/audit";
import { notify, notifySuperAdmins } from "@/lib/services/notifications";
import { recordProgress } from "@/lib/services/learning";

const profileSchema = z.object({
  fullName: z.string().trim().min(2).max(120), phone: z.string().trim().max(20).regex(/^[0-9+\-\s()]*$/, "Digits only").optional().default(""),
  city: z.string().trim().max(80).optional().default(""), bio: z.string().trim().max(600).optional().default(""),
  notifyEmail: z.string().optional().transform((v) => v === "on"), notifyLive: z.string().optional().transform((v) => v === "on"),
});

export async function updateProfileAction(_p: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = profileSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { ok: false, errors: zodErrors(parsed.error) };
  const d = parsed.data;
  await asUser(user, (tx) => tx`update public.profiles set full_name = ${d.fullName}, phone = ${d.phone || null}, city = ${d.city || null}, bio = ${d.bio || null},
                                notify_email = ${d.notifyEmail}, notify_live_reminders = ${d.notifyLive} where id = ${user.id}`);
  revalidatePath("/dashboard", "layout");
  return { ok: true, message: "Profile saved." };
}

export async function changePasswordAction(_p: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const next = passwordSchema.safeParse(fd.get("next"));
  if (!next.success) return { ok: false, errors: { next: next.error.issues[0].message } };
  const r = await changePassword(user.id, String(fd.get("current") || ""), next.data);
  if (!r.ok) return { ok: false, message: r.error };
  await audit({ actorId: user.id, action: "auth.password_changed", entityType: "auth" });
  redirect("/login?next=/dashboard/profile");
}

export async function markAllReadAction() {
  const user = await requireUser();
  await asUser(user, (tx) => tx`update public.notifications set read_at = now() where read_at is null`);
  revalidatePath("/dashboard", "layout");
}

export async function markReadAction(id: string) {
  const user = await requireUser();
  await asUser(user, (tx) => tx`update public.notifications set read_at = now() where id = ${id} and read_at is null`);
  revalidatePath("/dashboard", "layout");
}

export async function submitQuizAction(quizId: string, answers: Record<string, number>) {
  const user = await requireUser();
  const clean: Record<string, number> = {};
  for (const [k, v] of Object.entries(answers)) if (/^[0-9a-f-]{36}$/.test(k) && Number.isInteger(v) && v >= 0 && v < 8) clean[k] = v;
  const r = await submitQuiz(user, quizId, clean);
  revalidatePath("/dashboard", "layout");
  return r;
}

export async function markLessonDoneAction(lessonId: string) {
  const user = await requireUser();
  const r = await recordProgress(user, { lessonId, positionSeconds: 0, watchedDelta: 0, markComplete: true });
  revalidatePath("/dashboard", "layout");
  return r;
}

export async function submitAssignmentAction(_p: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const assignmentId = String(fd.get("assignmentId") || "");
  const [a] = await asUser(user, (tx) => tx`select a.*, s.status as sub_status from public.assignments a
                                            left join public.submissions s on s.assignment_id = a.id and s.user_id = ${user.id}
                                            where a.id = ${assignmentId}`);
  if (!a) return { ok: false, message: "Assignment not available." };
  if (a.sub_status && a.sub_status !== "SUBMITTED") return { ok: false, message: "This submission has already been graded." };
  const text = String(fd.get("text") || "").trim().slice(0, 20000) || null;
  const link = String(fd.get("link") || "").trim() || null;
  if (link && !/^https?:\/\/[^\s]+$/i.test(link)) return { ok: false, errors: { link: "Enter a full http(s) link." } };
  const file = fd.get("file");
  let fileKey: string | null = null, fileMime: string | null = null, fileSize: number | null = null;
  if (file instanceof File && file.size > 0) {
    if (!a.allow_file) return { ok: false, message: "File uploads are not allowed for this assignment." };
    try {
      const buf = Buffer.from(await file.arrayBuffer());
      const kind = validateUpload(buf, a.allowed_mime_types as string[], (a.max_file_mb as number) * 1024 * 1024);
      const stored = await putFile("private", `submissions/${assignmentId}`, buf, kind.mime, kind.ext);
      fileKey = `${stored.provider}:${stored.key}`; fileMime = kind.mime; fileSize = buf.length;
    } catch (e) {
      return { ok: false, errors: { file: (e as Error).message } };
    }
  }
  if (!text && !link && !fileKey) return { ok: false, message: "Add an answer, a link or a file." };
  await asUser(user, (tx) => tx`
    insert into public.submissions (assignment_id, user_id, text_answer, link_url, file_key, file_mime, file_size_bytes)
    values (${assignmentId}, ${user.id}, ${text}, ${link}, ${fileKey}, ${fileMime}, ${fileSize})
    on conflict (assignment_id, user_id) do update set text_answer = excluded.text_answer, link_url = excluded.link_url,
      file_key = coalesce(excluded.file_key, public.submissions.file_key), file_mime = coalesce(excluded.file_mime, public.submissions.file_mime),
      file_size_bytes = coalesce(excluded.file_size_bytes, public.submissions.file_size_bytes), submitted_at = now()`);
  const graders = await asService((tx) => tx`select user_id from public.content_manager_assignments where course_id = ${a.course_id}`);
  for (const g of graders) await notify(g.user_id as string, { kind: "ASSIGNMENT", title: `New submission: ${a.title}`, link: "/admin/submissions" });
  revalidatePath("/dashboard/assignments");
  return { ok: true, message: "Submitted! You'll be notified when it's graded." };
}

export async function requestRefundAction(_p: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const r = await requestRefund(user, String(fd.get("orderId") || ""), String(fd.get("reason") || "").slice(0, 1000));
  if (!r.ok) return { ok: false, message: r.error };
  await notifySuperAdmins({ kind: "PAYMENT", title: "Refund requested", link: "/admin/orders?tab=refunds" });
  revalidatePath("/dashboard/payments");
  return { ok: true, message: "Refund requested. The academy team will review it shortly." };
}

export async function dataRequestAction(kind: "EXPORT" | "DELETE") {
  const user = await requireUser();
  const [open] = await asUser(user, (tx) => tx`select id from public.data_requests where user_id = ${user.id} and kind = ${kind} and status = 'PENDING'`);
  if (!open) {
    await asUser(user, (tx) => tx`insert into public.data_requests (user_id, kind) values (${user.id}, ${kind})`);
    await audit({ actorId: user.id, action: `privacy.${kind.toLowerCase()}_request`, entityType: "profile", entityId: user.id });
    await notifySuperAdmins({ kind: "SYSTEM", title: `Data ${kind.toLowerCase()} request`, link: "/admin/users?tab=privacy" });
  }
  revalidatePath("/dashboard/profile");
}
