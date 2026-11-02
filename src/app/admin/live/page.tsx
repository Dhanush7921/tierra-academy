import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { asUser } from "@/lib/db/client";
import { proposeLiveAction } from "../actions";
import { Flash, type SP } from "../Flash";
import { DataTable } from "@/components/ui/data";
import { Card, Field, Input, PageHeader, Select, StatusBadge, Textarea } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/client";
import { formatDateTime } from "@/lib/format";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "Live classes · Admin" };

export default async function AdminLive({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const user = await requirePermission("live.propose");
  const sa = user.roles.includes("SUPER_ADMIN");
  const [rows, courses, hosts] = await asUser(user, async (tx) => [
    await tx`select s.id, s.title, s.starts_at, s.duration_minutes, s.status, s.provider, s.recording_status, c.title as course_title,
                    (select count(*) from public.attendance a where a.live_session_id = s.id)::int as attendees
             from public.live_sessions s join public.courses c on c.id = s.course_id where public.manages_course(s.course_id)
             order by (s.status in ('ENDED','CANCELLED','REJECTED')), s.starts_at limit 100`,
    await tx`select id, title from public.courses where public.manages_course(id) and delivery in ('LIVE','HYBRID') order by title`,
    sa ? await tx`select p.id, p.full_name from public.profiles p join public.user_roles r on r.user_id = p.id where r.role in ('CONTENT_MANAGER','SUPER_ADMIN') group by p.id order by p.full_name` : [],
  ]);
  return (
    <div className="mx-auto max-w-7xl">
      <Flash sp={sp} />
      <PageHeader eyebrow="Live" title="Live classes" description={`Provider: ${env().LIVE_PROVIDER === "zoom" ? "Zoom Meeting SDK" : "DEMO (simulated classroom)"}. ${sa ? "Sessions you create are scheduled immediately." : "Your proposals need Super Admin approval."}`} />
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <DataTable rows={rows} rowKey={(r) => r.id as string} empty={{ title: "No sessions yet" }}
          columns={[
            { key: "t", header: "Session", cell: (r) => <Link className="font-medium hover:text-brand-strong" href={`/admin/live/${r.id}`}>{r.title as string}<span className="block text-xs font-normal text-muted">{r.course_title as string}</span></Link> },
            { key: "w", header: "When", cell: (r) => <span className="text-sm">{formatDateTime(r.starts_at as string)}</span> },
            { key: "s", header: "Status", cell: (r) => <StatusBadge status={r.status as string} /> },
            { key: "a", header: "Attendees", cell: (r) => r.attendees as number },
          ]} />
        <Card className="h-fit p-5">
          <h2 className="mb-3 font-semibold">{sa ? "Schedule a class" : "Propose a class"}</h2>
          <form action={proposeLiveAction} className="grid gap-3">
            <Field label="Course" htmlFor="courseId"><Select id="courseId" name="courseId" required>{courses.map((c) => <option key={c.id as string} value={c.id as string}>{c.title as string}</option>)}</Select></Field>
            <Field label="Title" htmlFor="title"><Input id="title" name="title" required /></Field>
            <Field label="Description" htmlFor="description"><Textarea id="description" name="description" rows={2} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Starts (IST)" htmlFor="startsAt"><Input id="startsAt" name="startsAt" type="datetime-local" required /></Field>
              <Field label="Minutes" htmlFor="durationMinutes"><Input id="durationMinutes" name="durationMinutes" type="number" min="10" max="600" defaultValue="60" /></Field>
            </div>
            {sa && <Field label="Host" htmlFor="hostId"><Select id="hostId" name="hostId" defaultValue=""><option value="">Me</option>{hosts.map((h) => <option key={h.id as string} value={h.id as string}>{h.full_name as string}</option>)}</Select></Field>}
            <SubmitButton>{sa ? "Schedule" : "Submit proposal"}</SubmitButton>
            {!courses.length && <p className="text-xs text-muted">No live/hybrid courses are assigned to you.</p>}
          </form>
        </Card>
      </div>
    </div>
  );
}
