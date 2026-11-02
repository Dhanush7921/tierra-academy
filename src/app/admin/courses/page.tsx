import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { asUser } from "@/lib/db/client";
import { DataTable, FilterBar, Pagination, pageParam, strParam } from "@/components/ui/data";
import { Input, PageHeader, Select, StatusBadge, buttonClass } from "@/components/ui/primitives";
import { formatMoney, relativeTime } from "@/lib/format";
import { Flash, type SP } from "../Flash";

export const metadata: Metadata = { title: "Courses · Admin" };
const STATUSES = ["DRAFT", "REVIEW", "APPROVED", "REJECTED", "PUBLISHED", "ARCHIVED"];

export default async function AdminCourses({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const user = await requirePermission("course.editAssigned");
  const page = pageParam(sp.page), q = strParam(sp.q), status = STATUSES.includes(strParam(sp.status) ?? "") ? strParam(sp.status) : undefined, cat = strParam(sp.category);
  const [rows, cats] = await asUser(user, async (tx) => [
    await tx`select c.id, c.title, c.slug, c.status, c.delivery, c.is_free, c.price_paise, c.updated_at, cat.name as category,
                    (select count(*) from public.enrollments e where e.course_id = c.id)::int as enrollments, count(*) over()::int as total
             from public.courses c join public.course_categories cat on cat.id = c.category_id
             where (public.manages_course(c.id) or c.created_by = auth.uid())
               ${status ? tx`and c.status = ${status}` : tx``} ${cat ? tx`and cat.slug = ${cat}` : tx``}
               ${q ? tx`and c.title ilike ${"%" + q + "%"}` : tx``}
             order by c.updated_at desc limit 20 offset ${(page - 1) * 20}`,
    await tx`select slug, name from public.course_categories order by sort_order`,
  ]);
  const total = (rows[0]?.total as number) ?? 0;
  return (
    <div className="mx-auto max-w-7xl">
      <Flash sp={sp} />
      <PageHeader eyebrow="Content" title="Courses" description={user.roles.includes("SUPER_ADMIN") ? "All courses on the platform." : "Courses assigned to you. Publishing and pricing are handled by a Super Admin."}
        actions={<Link href="/admin/courses/new" className={buttonClass("primary", "sm")}>New course draft</Link>} />
      <FilterBar action="/admin/courses">
        <Input name="q" defaultValue={q} placeholder="Search title…" aria-label="Search" className="max-w-xs" />
        <Select name="status" defaultValue={status ?? ""} aria-label="Status" className="max-w-[180px]"><option value="">Any status</option>{STATUSES.map((s) => <option key={s} value={s}>{s.toLowerCase()}</option>)}</Select>
        <Select name="category" defaultValue={cat ?? ""} aria-label="Discipline" className="max-w-[200px]"><option value="">Any discipline</option>{cats.map((c) => <option key={c.slug as string} value={c.slug as string}>{c.name as string}</option>)}</Select>
      </FilterBar>
      <DataTable rows={rows} rowKey={(r) => r.id as string} caption="Courses" empty={{ title: "No courses found", action: <Link className={buttonClass("outline", "sm")} href="/admin/courses/new">Create a draft</Link> }}
        columns={[
          { key: "t", header: "Course", cell: (r) => <Link href={`/admin/courses/${r.id}`} className="font-medium hover:text-brand-strong">{r.title as string}<span className="block text-xs font-normal text-muted">{r.category as string} · {String(r.delivery).toLowerCase()}</span></Link> },
          { key: "s", header: "Status", cell: (r) => <StatusBadge status={r.status as string} /> },
          { key: "p", header: "Price", cell: (r) => r.is_free ? "Free" : formatMoney(r.price_paise as number) },
          { key: "e", header: "Enrollments", cell: (r) => r.enrollments as number },
          { key: "u", header: "Updated", cell: (r) => <span className="text-xs text-muted">{relativeTime(r.updated_at as string)}</span> },
        ]} />
      <Pagination page={page} pages={Math.max(1, Math.ceil(total / 20))} basePath="/admin/courses" params={{ q, status, category: cat }} />
    </div>
  );
}
