import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/session";
import { asService, asUser } from "@/lib/db/client";
import * as A from "../../actions";
import { Flash, type SP } from "../../Flash";
import { DataTable } from "@/components/ui/data";
import { Badge, Card, PageHeader, Select, StatusBadge, buttonClass } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/client";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Live session · Admin" };

export default async function LiveSessionAdmin({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requirePermission("live.propose");
  const sa = user.roles.includes("SUPER_ADMIN");
  const [s] = await asUser(user, (tx) => tx`select s.*, c.title as course_title, public.manages_course(s.course_id) as manages from public.live_sessions s join public.courses c on c.id = s.course_id where s.id = ${id}`);
  if (!s?.manages) notFound();
  // names of attendees are shown only to staff who manage this course (checked above)
  const [att, assets, [sec]] = await Promise.all([
    asService((tx) => tx`select a.*, p.full_name, p.email from public.attendance a join public.profiles p on p.id = a.user_id where a.live_session_id = ${id} order by a.joined_at`),
    asUser(user, (tx) => tx`select id, original_filename from public.video_assets where course_id = ${s.course_id} and status = 'READY'`),
    asService((tx) => tx`select meeting_id, join_url, start_url from public.live_session_secrets where live_session_id = ${id}`),
  ]);
  const bind = (fn: unknown, ...a: unknown[]) => (fn as (...x: unknown[]) => unknown).bind(null, ...a) as (fd: FormData) => Promise<void>;
  return (
    <div className="mx-auto max-w-6xl">
      <Flash sp={sp} />
      <PageHeader eyebrow={s.course_title as string} title={s.title as string} description={`${formatDateTime(s.starts_at as string)} · ${s.duration_minutes} min · provider ${s.provider}`}
        actions={<>
          <StatusBadge status={s.status as string} />
          {s.status === "SCHEDULED" && <form action={bind(A.liveStatusAction, id, "LIVE")}><SubmitButton size="sm">Start</SubmitButton></form>}
          {s.status === "LIVE" && <form action={bind(A.liveStatusAction, id, "ENDED")}><SubmitButton size="sm" variant="danger">End</SubmitButton></form>}
          {sa && ["SCHEDULED", "PROPOSED"].includes(s.status as string) && <form action={bind(A.liveStatusAction, id, "CANCELLED")}><SubmitButton size="sm" variant="outline">Cancel</SubmitButton></form>}
          {sa && s.status === "PROPOSED" && <form action={bind(A.decideLiveAction, id, true)}><input type="hidden" name="from" value={`/admin/live/${id}`} /><SubmitButton size="sm">Approve</SubmitButton></form>}
          {["SCHEDULED", "LIVE"].includes(s.status as string) && <Link href={`/dashboard/live/${id}`} className={buttonClass("outline", "sm")}>Open classroom</Link>}
        </>} />
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div>
          <h2 className="mb-3 font-semibold">Attendance ({att.length})</h2>
          <DataTable rows={att} rowKey={(r) => r.id as string} empty={{ title: "No attendance recorded yet" }}
            columns={[
              { key: "n", header: "Student", cell: (r) => <span>{r.full_name as string}<span className="block text-xs text-muted">{r.email as string}</span></span> },
              { key: "j", header: "Joined", cell: (r) => formatDateTime(r.joined_at as string) },
              { key: "d", header: "Minutes", cell: (r) => Math.round((r.duration_seconds as number) / 60) },
              { key: "s", header: "Source", cell: (r) => <Badge>{r.source as string}</Badge> },
            ]} />
        </div>
        <div className="space-y-4">
          <Card className="p-5 text-sm">
            <h2 className="mb-2 font-semibold">Meeting</h2>
            {sec?.join_url ? <><p>Meeting ID: <span className="font-mono">{sec.meeting_id as string}</span></p><a className="text-brand-strong underline" href={sec.join_url as string} target="_blank" rel="noopener noreferrer">External join link</a>{sec.start_url && <p><a className="text-brand-strong underline" href={sec.start_url as string} target="_blank" rel="noopener noreferrer">Host start link</a></p>}</>
              : <p className="text-muted">{s.provider === "demo" ? "Demo classroom — no external meeting." : "Meeting not provisioned yet."}</p>}
            {s.provider === "zoom" && s.status === "ENDED" && <form action={bind(A.syncAttendanceAction, id)} className="mt-3"><SubmitButton size="sm" variant="outline">Import Zoom attendance</SubmitButton></form>}
          </Card>
          <Card className="p-5 text-sm">
            <h2 className="mb-2 font-semibold">Recording <StatusBadge status={s.recording_status as string} /></h2>
            <p className="mb-3 text-muted">Attach an uploaded recording (Course → Media) to make it available to enrolled students.</p>
            <form action={bind(A.attachRecordingAction, id)} className="flex gap-2">
              <Select name="assetId" required aria-label="Recording video">{assets.map((a) => <option key={a.id as string} value={a.id as string}>{(a.original_filename as string) ?? a.id}</option>)}</Select>
              <SubmitButton size="md" variant="outline">Attach</SubmitButton>
            </form>
            {!assets.length && <p className="mt-2 text-xs text-muted">No ready videos for this course yet. <Link className="underline" href={`/admin/courses/${s.course_id}?tab=media`}>Upload one</Link>.</p>}
          </Card>
        </div>
      </div>
    </div>
  );
}
