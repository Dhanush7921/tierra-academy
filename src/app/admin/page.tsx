import type { Metadata } from "next";
import Link from "next/link";
import { requireStaff } from "@/lib/auth/session";
import { adminOverview } from "@/lib/services/analytics";
import { Flash, type SP } from "./Flash";
import { Alert, Card, EmptyState, PageHeader, StatCard, StatusBadge, buttonClass } from "@/components/ui/primitives";
import { AreaChart, BarChart, Donut } from "@/components/ui/charts";
import { formatMoney, relativeTime } from "@/lib/format";

export const metadata: Metadata = { title: "Admin overview" };

export default async function AdminHome({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const user = await requireStaff();
  const d = await adminOverview(user);
  const k = d.kpis as Record<string, number>;
  const sa = d.scope === "platform";
  return (
    <div className="mx-auto max-w-7xl">
      <Flash sp={sp} />
      {sp.denied && <div className="mb-5"><Alert tone="warn">That module is restricted to Super Admins.</Alert></div>}
      <PageHeader eyebrow={sa ? "Super Admin" : "Content Manager"} title={`Good to see you, ${user.fullName.split(" ")[0]}`}
        description={sa ? "Platform-wide overview from live database queries." : "Overview of the courses assigned to you."}
        actions={<><Link href="/admin/courses/new" className={buttonClass("primary", "sm")}>New course draft</Link><Link href="/admin/live" className={buttonClass("outline", "sm")}>{sa ? "Schedule live class" : "Propose live class"}</Link></>} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {sa ? <StatCard label="Students" value={k.students} hint={`+${k.new_users_30d} accounts in 30 days`} icon="users" /> : <StatCard label="My courses" value={k.total_courses} hint={`${k.published_courses} published`} icon="book" />}
        <StatCard label="Enrollments" value={k.enrollments} hint={`+${k.enrollments_30d} in 30 days`} icon="layers" accent="#38d2ff" />
        {sa ? <StatCard label="Net revenue" value={formatMoney(Number(k.gross_paise) - Number(k.refunded_paise))} hint={`${formatMoney(Number(k.refunded_paise))} refunded · ${k.open_refunds} open requests`} icon="wallet" accent="#9be15d" />
            : <StatCard label="Submissions to grade" value={k.to_grade} icon="inbox" accent="#9be15d" />}
        <StatCard label={sa ? "Pending approvals" : "My pending requests"} value={k.pending_approvals} hint={`${k.upcoming_live} upcoming live classes`} icon="check" accent="#ffd60a" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <Card className="p-5">
          <div className="mb-2 flex items-baseline justify-between"><h2 className="font-display text-lg font-semibold">Enrollments · last 30 days</h2><span className="text-xs text-muted">{d.daily.reduce((s, x) => s + (x.enrollments as number), 0)} total</span></div>
          <AreaChart label="Daily enrollments, last 30 days" data={d.daily.map((x) => ({ label: x.day as string, value: x.enrollments as number }))} />
          {sa && (
            <>
              <h3 className="mb-2 mt-6 text-sm font-semibold text-fg-2">Revenue by day (₹)</h3>
              <BarChart label="Daily revenue, last 30 days" height={130} format={(n) => formatMoney(n)} data={d.daily.map((x) => ({ label: (x.day as string).slice(5), value: Number(x.revenue) }))} />
            </>
          )}
        </Card>
        <Card className="p-5">
          <h2 className="mb-4 font-display text-lg font-semibold">{sa ? "Enrollments by discipline" : "My courses"}</h2>
          {sa ? <Donut label="Enrollments by discipline" data={d.byCategory.map((c) => ({ label: c.name as string, value: c.enrollments as number, color: c.accent as string }))} center={String(k.enrollments)} />
              : <ul className="space-y-3">{d.topCourses.map((c) => <li key={c.id as string} className="flex items-center justify-between gap-3 text-sm"><Link className="truncate hover:text-brand-strong" href={`/admin/courses/${c.id}`}>{c.title as string}</Link><span className="flex items-center gap-2"><StatusBadge status={c.status as string} /><span className="text-muted">{c.enrollments as number}</span></span></li>)}</ul>}
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <div className="mb-3 flex justify-between"><h2 className="font-display text-lg font-semibold">{sa ? "Pending approvals" : "My review requests"}</h2>{sa && <Link className="text-sm text-brand-strong" href="/admin/approvals">Review →</Link>}</div>
          {d.pending.length ? <ul className="divide-y divide-line">{d.pending.map((p) => (
            <li key={p.id as string} className="flex items-center justify-between gap-3 py-2.5 text-sm"><div className="min-w-0"><p className="truncate font-medium">{p.course_title as string}</p><p className="text-xs text-muted">{String(p.kind).replace("_", " ").toLowerCase()} · {relativeTime(p.created_at as string)}</p></div>{p.status ? <StatusBadge status={p.status as string} /> : <StatusBadge status="PENDING" />}</li>
          ))}</ul> : <EmptyState icon="check" title="Nothing waiting" />}
        </Card>
        <Card className="p-5">
          <h2 className="mb-3 font-display text-lg font-semibold">{sa ? "Recent activity" : "Top courses"}</h2>
          {sa ? (d.recentActivity.length ? <ul className="divide-y divide-line text-sm">{d.recentActivity.map((a, i) => (
            <li key={i} className="flex justify-between gap-3 py-2"><span className="truncate"><span className="font-mono text-xs text-brand-strong">{a.action as string}</span> · {(a.full_name as string) || (a.email as string) || "system"}</span><span className="shrink-0 text-xs text-muted">{relativeTime(a.created_at as string)}</span></li>
          ))}</ul> : <EmptyState title="No activity yet" />) : (
            <ul className="space-y-2 text-sm">{d.topCourses.map((c) => <li key={c.id as string} className="flex justify-between"><span className="truncate">{c.title as string}</span><span className="text-muted">{Math.round(c.avg_progress as number)}% avg progress</span></li>)}</ul>
          )}
        </Card>
      </div>
    </div>
  );
}
