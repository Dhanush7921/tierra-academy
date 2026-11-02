import type { Metadata } from "next";
import Link from "next/link";
import { listUpcomingSessions } from "@/lib/services/catalog";
import { Badge, Card, EmptyState, PageHeader, buttonClass } from "@/components/ui/primitives";
import { formatDate, formatDateTime } from "@/lib/format";
import { Icon } from "@/components/ui/Icon";

export const metadata: Metadata = { title: "Live classes", description: "Upcoming instructor-led live engineering classes." };
export const revalidate = 60;

export default async function LivePage() {
  const sessions = await listUpcomingSessions();
  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
      <PageHeader eyebrow="Live classes" title="Upcoming live sessions" description="Join instructor-led sessions with your enrolled courses. Enrolled students get reminders and recordings." />
      {sessions.length ? (
        <ol className="space-y-3">
          {sessions.map((s) => {
            const start = new Date(s.starts_at as string);
            const liveNow = s.status === "LIVE" || (start.getTime() <= Date.now() && start.getTime() + (s.duration_minutes as number) * 60000 > Date.now());
            return (
              <li key={s.id as string}>
                <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
                  <div className="grid w-20 shrink-0 place-items-center rounded-2xl bg-surface-2 py-3 text-center">
                    <span className="font-mono text-[10px] uppercase tracking-widest text-muted">{formatDate(start, { month: "short" })}</span>
                    <span className="font-display text-2xl font-semibold">{formatDate(start, { day: "2-digit" })}</span>
                  </div>
                  <div className="flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      {liveNow ? <Badge tone="danger">● Live now</Badge> : <Badge tone="info">Scheduled</Badge>}
                      <span className="text-xs" style={{ color: s.accent as string }}>{s.category_name as string}</span>
                      {s.is_demo && <Badge tone="warn">Demo session</Badge>}
                    </div>
                    <h2 className="font-semibold">{s.title as string}</h2>
                    <p className="text-sm text-muted">{formatDateTime(start)} IST · {s.duration_minutes as number} min · {s.course_title as string}</p>
                  </div>
                  <div className="flex gap-2">
                    <Link href={`/courses/${s.course_slug}`} className={buttonClass("outline", "sm")}>Course</Link>
                    <Link href={`/dashboard/live/${s.id}`} className={buttonClass(liveNow ? "primary" : "secondary", "sm")}><Icon name="video" size={14} />{liveNow ? "Join" : "Details"}</Link>
                  </div>
                </Card>
              </li>
            );
          })}
        </ol>
      ) : (
        <EmptyState icon="video" title="No live sessions scheduled" description="New sessions appear here as soon as they are approved." action={<Link className={buttonClass("outline", "sm")} href="/courses?delivery=LIVE">Browse live courses</Link>} />
      )}
    </div>
  );
}
