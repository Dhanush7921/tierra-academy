import { asService, asUser } from "@/lib/db/client";
import { randomToken, sha256Hex } from "@/lib/crypto";
import { absoluteUrl } from "@/lib/paths";
import { sendEmail } from "@/lib/providers/email";
import { audit } from "@/lib/services/audit";
import { grantEnrollment, eligibilityError, loadEligibility, type EligibilityCourse } from "@/lib/services/enrollment";
import { escapeHtml } from "@/lib/services/notifications";

/**
 * Invitations: only a SHA-256 hash of the token is stored. A link never bypasses payment —
 * paid courses still require checkout unless a Super Admin explicitly marked the invitation
 * as complimentary (enforced by RLS policy + guard trigger + this service).
 */
export interface CreateInvitationInput {
  courseId: string | null;
  liveSessionId?: string | null;
  email?: string | null;
  grantsComplimentary?: boolean;
  maxUses?: number;
  expiresInDays?: number;
  note?: string;
}

export async function createInvitation(actor: { id: string; email: string }, input: CreateInvitationInput) {
  const token = randomToken(24);
  const expires = new Date(Date.now() + Math.min(Math.max(input.expiresInDays ?? 14, 1), 90) * 86400_000);
  // insert through RLS: Content Managers can only invite to assigned courses and never complimentary
  const [row] = await asUser(actor, (tx) => tx`
    insert into public.invitations (token_hash, course_id, live_session_id, email, grants_complimentary, max_uses, expires_at, note, created_by)
    values (${sha256Hex(token)}, ${input.courseId}, ${input.liveSessionId ?? null}, ${input.email?.trim().toLowerCase() || null},
            ${Boolean(input.grantsComplimentary)}, ${input.maxUses ?? 1}, ${expires}, ${input.note ?? null}, ${actor.id})
    returning id`);
  const link = absoluteUrl(`/invite/${token}`);
  const [course] = input.courseId ? await asService((tx) => tx`select title from public.courses where id = ${input.courseId}`) : [null];
  if (input.email) {
    await sendEmail({
      to: input.email,
      subject: `You're invited to ${course?.title ?? "a Tierra Academy class"}`,
      template: "invitation",
      html: `<p>You have been invited to join <b>${escapeHtml((course?.title as string) ?? "Tierra Academy")}</b>.</p>
             ${input.grantsComplimentary ? "<p>This invitation includes complimentary access.</p>" : ""}
             <p><a href="${link}">Accept invitation →</a></p><p>This link expires on ${expires.toDateString()}.</p>`,
    });
  }
  await audit({ actorId: actor.id, action: "invitation.create", entityType: "invitation", entityId: row.id as string, metadata: { courseId: input.courseId, complimentary: Boolean(input.grantsComplimentary), email: input.email ?? null } });
  const whatsapp = `https://wa.me/?text=${encodeURIComponent(`You're invited to ${course?.title ?? "Tierra Academy"} — ${link}`)}`;
  return { id: row.id as string, link, whatsapp, expiresAt: expires };
}

export async function lookupInvitation(token: string) {
  const [inv] = await asService((tx) => tx`
    select i.*, c.title as course_title, c.slug as course_slug, c.is_free, c.status as course_status,
           s.title as session_title, s.starts_at as session_starts_at
    from public.invitations i
    left join public.courses c on c.id = i.course_id
    left join public.live_sessions s on s.id = i.live_session_id
    where i.token_hash = ${sha256Hex(token)}`);
  if (!inv) return { valid: false as const, reason: "This invitation link is not valid." };
  if (inv.revoked_at) return { valid: false as const, reason: "This invitation has been revoked." };
  if (new Date(inv.expires_at as string) < new Date()) return { valid: false as const, reason: "This invitation has expired." };
  if ((inv.use_count as number) >= (inv.max_uses as number)) return { valid: false as const, reason: "This invitation has already been used." };
  return { valid: true as const, invitation: inv };
}

export type AcceptResult =
  | { ok: true; enrolled: boolean; redirect: string; message: string }
  | { ok: false; error: string };

export async function acceptInvitation(user: { id: string; email: string }, token: string): Promise<AcceptResult> {
  const found = await lookupInvitation(token);
  if (!found.valid) return { ok: false, error: found.reason };
  const inv = found.invitation;
  if (inv.email && (inv.email as string).toLowerCase() !== user.email.toLowerCase())
    return { ok: false, error: "This invitation was sent to a different email address." };
  const courseId = inv.course_id as string | null;
  const courseSlug = inv.course_slug as string | null;

  return asService(async (tx): Promise<AcceptResult> => {
    // lock & re-check usage atomically
    const [locked] = await tx`select use_count, max_uses from public.invitations where id = ${inv.id} for update`;
    if ((locked.use_count as number) >= (locked.max_uses as number)) return { ok: false, error: "This invitation has already been used." };
    const redeemed = await tx`insert into public.invitation_redemptions (invitation_id, user_id) values (${inv.id}, ${user.id}) on conflict do nothing returning user_id`;
    if (!courseId) {
      return { ok: true, enrolled: false, redirect: "/dashboard/live", message: "Invitation accepted." };
    }
    const [existing] = await tx`select status from public.enrollments where user_id = ${user.id} and course_id = ${courseId}`;
    if (existing && ["ACTIVE", "COMPLETED"].includes(existing.status as string))
      return { ok: true, enrolled: true, redirect: `/dashboard/courses`, message: "You are already enrolled in this course." };

    const complimentary = Boolean(inv.grants_complimentary);
    if (!inv.is_free && !complimentary) {
      // paid course without explicit complimentary grant → normal checkout (no bypass)
      return { ok: true, enrolled: false, redirect: `/checkout/${courseSlug}?invite=1`, message: "Complete checkout to join this paid course." };
    }
    const el = await loadEligibility(tx, courseId);
    // complimentary grants (Super Admin) bypass capacity/open window but never an unpublished course
    const err = el ? (complimentary ? (el.course.status === "PUBLISHED" ? null : "Course is not published.") : eligibilityError(el.course as unknown as EligibilityCourse, el.activeCount)) : "Course not found.";
    if (err) return { ok: false, error: err };
    if (redeemed[0]) await tx`update public.invitations set use_count = use_count + 1 where id = ${inv.id}`;
    await grantEnrollment(tx, {
      userId: user.id, courseId, source: complimentary ? "COMPLIMENTARY" : "INVITATION",
      invitationId: inv.id as string, grantedBy: complimentary ? (inv.created_by as string) : null, accessDays: el!.course.access_days as number | null,
    });
    await audit({ actorId: user.id, action: "invitation.accept", entityType: "invitation", entityId: inv.id as string, metadata: { courseId, complimentary } }, tx);
    return { ok: true, enrolled: true, redirect: "/dashboard/courses", message: complimentary ? "Complimentary access granted." : "You're enrolled!" };
  });
}

export async function revokeInvitation(actor: { id: string; email: string }, id: string) {
  const rows = await asUser(actor, (tx) => tx`update public.invitations set revoked_at = now() where id = ${id} and revoked_at is null returning id`);
  if (rows[0]) await audit({ actorId: actor.id, action: "invitation.revoke", entityType: "invitation", entityId: id });
  return Boolean(rows[0]);
}
