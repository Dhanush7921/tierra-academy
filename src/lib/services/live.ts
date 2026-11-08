import { asService, asUser } from "@/lib/db/client";
import { env } from "@/lib/env";
import { createMeeting, fetchParticipants, fetchRecordings, meetingSdkSignature } from "@/lib/providers/live";
import { audit } from "@/lib/services/audit";
import { notify, notifySuperAdmins } from "@/lib/services/notifications";
import { sendEmail } from "@/lib/providers/email";
import { absoluteUrl } from "@/lib/paths";
import { formatDateTime } from "@/lib/format";

type Actor = { id: string; email: string; roles: string[] };

export async function proposeSession(actor: Actor, input: { courseId: string; title: string; description: string; startsAt: Date; durationMinutes: number; hostId?: string | null }) {
  const isSA = actor.roles.includes("SUPER_ADMIN");
  const [row] = await asUser(actor, (tx) => tx`
    insert into public.live_sessions (course_id, title, description, starts_at, duration_minutes, host_id, status, provider, proposed_by)
    values (${input.courseId}, ${input.title}, ${input.description}, ${input.startsAt}, ${input.durationMinutes},
            ${isSA ? input.hostId ?? actor.id : actor.id}, ${isSA ? "SCHEDULED" : "PROPOSED"}, ${env().LIVE_PROVIDER}, ${actor.id})
    returning id, status`);
  if (row.status === "PROPOSED") {
    await asService((tx) => tx`insert into public.approval_requests (course_id, live_session_id, kind, requested_by, note)
                               values (${input.courseId}, ${row.id}, 'LIVE_SESSION', ${actor.id}, ${input.title})`);
    await notifySuperAdmins({ kind: "APPROVAL", title: "Live class proposed", body: `${input.title} — ${formatDateTime(input.startsAt)}`, link: "/admin/approvals" });
  } else {
    await provisionMeeting(row.id as string);
  }
  await audit({ actorId: actor.id, action: `live.${row.status === "PROPOSED" ? "propose" : "schedule"}`, entityType: "live_session", entityId: row.id as string });
  return row.id as string;
}

/** Creates the provider meeting (Zoom or demo) and stores credentials in live_session_secrets. */
export async function provisionMeeting(sessionId: string) {
  const [s] = await asService((tx) => tx`select * from public.live_sessions where id = ${sessionId}`);
  const m = await createMeeting({ topic: s.title as string, startsAt: new Date(s.starts_at as string), durationMinutes: s.duration_minutes as number, autoRecord: true });
  await asService((tx) => tx`
    insert into public.live_session_secrets (live_session_id, meeting_id, meeting_uuid, passcode, join_url, start_url)
    values (${sessionId}, ${m.meetingId}, ${m.meetingUuid ?? null}, ${m.passcode ?? null}, ${m.joinUrl}, ${m.startUrl ?? null})
    on conflict (live_session_id) do update set meeting_id = excluded.meeting_id, meeting_uuid = excluded.meeting_uuid,
      passcode = excluded.passcode, join_url = excluded.join_url, start_url = excluded.start_url, updated_at = now()`);
}

export async function decideSession(admin: Actor, sessionId: string, approve: boolean, comment: string) {
  await asService(async (tx) => {
    const [s] = await tx`update public.live_sessions set status = ${approve ? "SCHEDULED" : "REJECTED"}
                         where id = ${sessionId} and status = 'PROPOSED' returning proposed_by, title`;
    if (!s) throw new Error("Session is not awaiting approval.");
    await tx`update public.approval_requests set status = ${approve ? "APPROVED" : "REJECTED"}, decided_by = ${admin.id},
             decision_comment = ${comment}, decided_at = now() where live_session_id = ${sessionId} and status = 'PENDING'`;
    await audit({ actorId: admin.id, actorRole: "SUPER_ADMIN", action: approve ? "live.approve" : "live.reject", entityType: "live_session", entityId: sessionId, metadata: { comment } }, tx);
    if (s.proposed_by) await notify(s.proposed_by as string, { kind: "APPROVAL", title: `Live class ${approve ? "approved" : "rejected"}: ${s.title}`, body: comment, link: "/admin/live" }, tx);
  });
  if (approve) await provisionMeeting(sessionId);
}

export type JoinInfo =
  | { ok: true; mode: "demo"; session: Record<string, unknown>; isHost: boolean }
  | { ok: true; mode: "zoom"; session: Record<string, unknown>; isHost: boolean; sdk: { signature: string; sdkKey: string; meetingNumber: string; passcode: string; userName: string; userEmail: string }; joinUrl: string }
  | { ok: false; error: string };

/** Enforces enrollment (RLS can_join_live) and a join window before revealing meeting credentials. */
export async function getJoinInfo(user: { id: string; email: string; fullName: string }, sessionId: string): Promise<JoinInfo> {
  const [s] = await asUser(user, (tx) => tx`
    select s.*, c.title as course_title, c.slug as course_slug, public.can_join_live(s.id) as can_join,
           public.manages_course(s.course_id) as is_staff
    from public.live_sessions s join public.courses c on c.id = s.course_id where s.id = ${sessionId}`);
  if (!s || !s.can_join) return { ok: false, error: "You need to be enrolled in this course to join the class." };
  if (s.status === "CANCELLED" || s.status === "REJECTED") return { ok: false, error: "This class was cancelled." };
  const start = new Date(s.starts_at as string).getTime();
  const end = start + (s.duration_minutes as number) * 60_000;
  const now = Date.now();
  const isHost = s.host_id === user.id || Boolean(s.is_staff);
  if (!isHost && now < start - 15 * 60_000) return { ok: false, error: `The classroom opens 15 minutes before the start (${formatDateTime(s.starts_at as string)}).` };
  if (s.status === "ENDED" || now > end + 60 * 60_000) return { ok: false, error: "This class has ended. Check the course for the recording." };
  const session = { id: s.id, title: s.title, courseTitle: s.course_title, courseSlug: s.course_slug, startsAt: s.starts_at, durationMinutes: s.duration_minutes, status: s.status, recordingNotice: s.recording_consent_notice };
  if (s.provider !== "zoom") {
    // The simulated classroom is never shown as a real class in production.
    if (env().APP_MODE === "production") return { ok: false, error: "Live classes are not connected yet. The academy team will share the class link with enrolled students." };
    return { ok: true, mode: "demo", session, isHost };
  }
  const [sec] = await asService((tx) => tx`select meeting_id, passcode, join_url from public.live_session_secrets where live_session_id = ${sessionId}`);
  if (!sec?.meeting_id) return { ok: false, error: "The meeting has not been provisioned yet. Please try again shortly." };
  const sig = meetingSdkSignature(sec.meeting_id as string, s.host_id === user.id ? 1 : 0);
  return {
    ok: true, mode: "zoom", session, isHost, joinUrl: sec.join_url as string,
    sdk: { ...sig, meetingNumber: sec.meeting_id as string, passcode: (sec.passcode as string) ?? "", userName: user.fullName, userEmail: user.email },
  };
}

/** In-app attendance heartbeat (demo classroom + Zoom component view). Called every 30 s. */
export async function attendanceHeartbeat(user: { id: string; email: string }, sessionId: string, leaving = false) {
  const [ok] = await asUser(user, (tx) => tx`select public.can_join_live(${sessionId}) as ok`);
  if (!ok?.ok) return false;
  await asService((tx) => tx`
    insert into public.attendance (live_session_id, user_id) values (${sessionId}, ${user.id})
    on conflict (live_session_id, user_id) do update set
      duration_seconds = public.attendance.duration_seconds + least(extract(epoch from (now() - public.attendance.last_seen_at))::int, 45),
      last_seen_at = now(),
      left_at = case when ${leaving} then now() else null end`);
  return true;
}

export async function setSessionStatus(actor: Actor, sessionId: string, status: "LIVE" | "ENDED" | "CANCELLED") {
  // through RLS + guard trigger: hosts may go LIVE/ENDED, Super Admins anything
  const rows = await asUser(actor, (tx) => tx`update public.live_sessions set status = ${status} where id = ${sessionId} returning id, course_id, title`);
  if (!rows[0]) throw new Error("Not allowed.");
  await audit({ actorId: actor.id, action: `live.${status.toLowerCase()}`, entityType: "live_session", entityId: sessionId });
  if (status === "ENDED") {
    await asService((tx) => tx`update public.live_sessions set recording_status = case when provider = 'zoom' then 'PENDING'::public.recording_status else recording_status end where id = ${sessionId}`);
    await asService((tx) => tx`update public.attendance set left_at = coalesce(left_at, now()) where live_session_id = ${sessionId}`);
  }
}

/** Zoom → attendance import (report API). Matches participants by email. */
export async function syncZoomAttendance(sessionId: string) {
  const [sec] = await asService((tx) => tx`select meeting_uuid, meeting_id from public.live_session_secrets where live_session_id = ${sessionId}`);
  if (!sec) return 0;
  const participants = await fetchParticipants((sec.meeting_uuid as string) || (sec.meeting_id as string));
  const byEmail = new Map<string, number>();
  for (const p of participants) if (p.email) byEmail.set(p.email.toLowerCase(), (byEmail.get(p.email.toLowerCase()) ?? 0) + p.durationSeconds);
  let n = 0;
  for (const [email, secs] of byEmail) {
    const r = await asService((tx) => tx`
      insert into public.attendance (live_session_id, user_id, duration_seconds, source)
      select ${sessionId}, p.id, ${secs}, 'zoom_report' from public.profiles p where p.email = ${email}
      on conflict (live_session_id, user_id) do update set duration_seconds = greatest(public.attendance.duration_seconds, excluded.duration_seconds), source = 'zoom_report'
      returning user_id`);
    n += r.length;
  }
  return n;
}

export async function listZoomRecordings(sessionId: string) {
  const [sec] = await asService((tx) => tx`select meeting_uuid, meeting_id from public.live_session_secrets where live_session_id = ${sessionId}`);
  if (!sec) return [];
  return fetchRecordings((sec.meeting_uuid as string) || (sec.meeting_id as string));
}

/** Cron: reminder emails ~60 minutes before class for enrolled students who opted in. */
export async function sendDueReminders() {
  const sessions = await asService((tx) => tx`
    update public.live_sessions set reminder_sent_at = now()
    where status = 'SCHEDULED' and reminder_sent_at is null and starts_at between now() and now() + interval '65 minutes'
    returning id, course_id, title, starts_at`);
  let sent = 0;
  for (const s of sessions) {
    const students = await asService((tx) => tx`
      select p.id, p.email from public.enrollments e join public.profiles p on p.id = e.user_id
      where e.course_id = ${s.course_id} and e.status in ('ACTIVE','COMPLETED') and p.notify_live_reminders and p.deleted_at is null`);
    for (const st of students) {
      await notify(st.id as string, { kind: "LIVE", title: `Starting soon: ${s.title}`, body: `Your live class starts at ${formatDateTime(s.starts_at as string)}.`, link: `/dashboard/live/${s.id}` });
      await sendEmail({ to: st.email as string, subject: `Reminder: ${s.title} starts soon`, template: "live-reminder",
        html: `<p>Your live class <b>${s.title}</b> starts at ${formatDateTime(s.starts_at as string)} (IST).</p><p><a href="${absoluteUrl(`/dashboard/live/${s.id}`)}">Join the classroom →</a></p><p>Classes may be recorded for enrolled students. You will see a recording notice when you join.</p>` });
      sent++;
    }
  }
  return { sessions: sessions.length, sent };
}
