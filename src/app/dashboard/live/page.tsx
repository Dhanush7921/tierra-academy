import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { myLiveSessions } from "@/lib/services/student";
import { DataTable } from "@/components/ui/data";
import { PageHeader, StatusBadge, buttonClass } from "@/components/ui/primitives";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Live classes" };

export default async function MyLive() {
  const user = await requireUser();
  const rows = await myLiveSessions(user);
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader eyebrow="Live" title="Live classes" description="Classes for courses you're enrolled in. The classroom opens 15 minutes before start." />
      <DataTable rows={rows} rowKey={(r) => r.id as string} caption="Live classes"
        empty={{ title: "No live classes yet", description: "Enroll in a live or hybrid course to see its schedule.", action: <Link className={buttonClass("outline", "sm")} href="/courses?delivery=LIVE">Live courses</Link> }}
        columns={[
          { key: "t", header: "Class", cell: (r) => <div><p className="font-medium">{r.title as string}</p><p className="text-xs text-muted">{r.course_title as string}</p></div> },
          { key: "w", header: "When", cell: (r) => <span className="text-sm">{formatDateTime(r.starts_at as string)} · {r.duration_minutes as number}m</span> },
          { key: "s", header: "Status", cell: (r) => <StatusBadge status={r.status as string} /> },
          { key: "a", header: "Attendance", cell: (r) => <span className="text-sm text-muted">{r.attended_seconds ? `${Math.round((r.attended_seconds as number) / 60)} min` : "—"}</span> },
          { key: "x", header: "", cell: (r) => r.status !== "ENDED" ? <Link className={buttonClass(r.status === "LIVE" ? "primary" : "outline", "sm")} href={`/dashboard/live/${r.id}`}>{r.status === "LIVE" ? "Join now" : "Open"}</Link> : <span className="text-xs text-muted">Recording: {String(r.recording_status).toLowerCase()}</span> },
        ]} />
    </div>
  );
}
