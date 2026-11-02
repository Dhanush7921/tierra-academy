import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { adminOverview } from "@/lib/services/analytics";
import { Card, PageHeader, StatCard } from "@/components/ui/primitives";
import { AreaChart, BarChart, Donut } from "@/components/ui/charts";
import { DataTable } from "@/components/ui/data";
import { formatAmount as formatMoney } from "@/lib/format";

export const metadata: Metadata = { title: "Analytics · Admin" };

export default async function Analytics() {
  const user = await requirePermission("analytics.limited");
  const d = await adminOverview(user);
  const k = d.kpis as Record<string, number>;
  const sa = d.scope === "platform";
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader eyebrow="Insights" title="Analytics" description={sa ? "Platform analytics (live queries)." : "Limited analytics for your assigned courses — open a course's Analytics tab for lesson-level detail."} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Enrollments" value={k.enrollments} hint={`+${k.enrollments_30d} last 30 days`} icon="layers" />
        <StatCard label="Published courses" value={k.published_courses} icon="book" />
        {sa && <StatCard label="Gross revenue" value={formatMoney(Number(k.gross_paise))} icon="wallet" accent="#9be15d" />}
        {sa && <StatCard label="Certificates issued" value={k.certificates} icon="award" accent="#ffd60a" />}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5"><h2 className="mb-3 font-semibold">Enrollments (30 days)</h2><AreaChart label="Enrollments, 30 days" data={d.daily.map((x) => ({ label: x.day as string, value: x.enrollments as number }))} /></Card>
        {sa ? <Card className="p-5"><h2 className="mb-3 font-semibold">Revenue (30 days)</h2><BarChart label="Revenue, 30 days" format={(n) => formatMoney(n)} data={d.daily.map((x) => ({ label: (x.day as string).slice(5), value: Number(x.revenue) }))} /></Card>
            : <Card className="p-5"><h2 className="mb-3 font-semibold">Average progress by course</h2><BarChart label="Average progress" data={d.topCourses.map((c) => ({ label: String(c.title).slice(0, 8), value: Math.round(c.avg_progress as number) }))} /></Card>}
      </div>
      {sa && <Card className="p-5"><h2 className="mb-3 font-semibold">Enrollments by discipline</h2><Donut label="By discipline" data={d.byCategory.map((c) => ({ label: c.name as string, value: c.enrollments as number, color: c.accent as string }))} /></Card>}
      <DataTable rows={d.topCourses} rowKey={(r) => r.id as string} caption="Courses"
        columns={[
          { key: "t", header: "Course", cell: (r) => <Link className="hover:text-brand-strong" href={`/admin/courses/${r.id}?tab=analytics`}>{r.title as string}</Link> },
          { key: "e", header: "Enrollments", cell: (r) => r.enrollments as number },
          { key: "p", header: "Avg progress", cell: (r) => `${Math.round((r.avg_progress as number) ?? 0)}%` },
        ]} />
    </div>
  );
}
