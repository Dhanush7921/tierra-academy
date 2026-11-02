import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { asUser } from "@/lib/db/client";
import * as A from "../actions";
import { Flash, type SP } from "../Flash";
import { DataTable, FilterBar, Pagination, pageParam, strParam } from "@/components/ui/data";
import { Badge, Card, Input, PageHeader, Select, StatusBadge, cx } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/client";
import { formatDate, formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Users · Admin" };

export default async function Users({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const user = await requirePermission("users.manage");
  const tab = sp.tab === "privacy" ? "privacy" : "users";
  const page = pageParam(sp.page), q = strParam(sp.q), role = ["STUDENT", "CONTENT_MANAGER", "SUPER_ADMIN"].includes(strParam(sp.role) ?? "") ? strParam(sp.role) : undefined;
  const [rows, courses, reqs] = await asUser(user, async (tx) => [
    await tx`select p.id, p.full_name, p.email, p.is_disabled, p.deleted_at, p.created_at, array_agg(r.role::text order by r.role) as roles,
                    (select count(*) from public.enrollments e where e.user_id = p.id)::int as enrollments, count(*) over()::int as total
             from public.profiles p left join public.user_roles r on r.user_id = p.id
             where true ${q ? tx`and (p.email ilike ${"%" + q + "%"} or p.full_name ilike ${"%" + q + "%"})` : tx``}
             group by p.id having ${role ? tx`${role} = any(array_agg(r.role::text))` : tx`true`}
             order by p.created_at desc limit 25 offset ${(page - 1) * 25}`,
    await tx`select id, title from public.courses where status = 'PUBLISHED' order by title`,
    await tx`select d.*, p.email, p.full_name from public.data_requests d join public.profiles p on p.id = d.user_id order by d.status = 'PENDING' desc, d.created_at desc limit 50`,
  ]);
  return (
    <div className="mx-auto max-w-7xl">
      <Flash sp={sp} />
      <PageHeader eyebrow="People" title="Students & users" />
      <nav className="mb-4 flex gap-1 border-b border-line">{[["users", "Accounts"], ["privacy", "Privacy requests"]].map(([k, l]) => <Link key={k} href={`/admin/users?tab=${k}`} className={cx("border-b-2 px-3 py-2 text-sm", tab === k ? "border-brand" : "border-transparent text-muted")}>{l}</Link>)}</nav>
      {tab === "users" ? (
        <>
          <FilterBar action="/admin/users">
            <Input name="q" defaultValue={q} placeholder="Name or email" aria-label="Search" className="max-w-xs" />
            <Select name="role" defaultValue={role ?? ""} aria-label="Role" className="max-w-[200px]"><option value="">Any role</option><option value="STUDENT">Student</option><option value="CONTENT_MANAGER">Content Manager</option><option value="SUPER_ADMIN">Super Admin</option></Select>
          </FilterBar>
          <DataTable rows={rows} rowKey={(r) => r.id as string} empty={{ title: "No users found" }}
            columns={[
              { key: "n", header: "User", cell: (r) => <span><span className="font-medium">{r.full_name as string}</span><span className="block text-xs text-muted">{r.email as string}</span></span> },
              { key: "r", header: "Roles", cell: (r) => <span className="flex flex-wrap gap-1">{(r.roles as string[]).filter(Boolean).map((x) => <Badge key={x} tone={x === "SUPER_ADMIN" ? "brand" : x === "CONTENT_MANAGER" ? "info" : "neutral"}>{x.replace("_", " ").toLowerCase()}</Badge>)}</span> },
              { key: "e", header: "Enrollments", cell: (r) => r.enrollments as number },
              { key: "j", header: "Joined", cell: (r) => <span className="text-xs">{formatDate(r.created_at as string)}</span> },
              { key: "s", header: "Status", cell: (r) => r.deleted_at ? <Badge tone="danger">deleted</Badge> : r.is_disabled ? <Badge tone="warn">disabled</Badge> : <Badge tone="ok">active</Badge> },
              { key: "a", header: "", cell: (r) => (r.roles as string[]).includes("SUPER_ADMIN") || r.deleted_at ? null : (
                <span className="flex flex-wrap justify-end gap-1">
                  <form action={A.setDisabledAction.bind(null, r.id as string, !r.is_disabled)}><SubmitButton size="sm" variant="ghost">{r.is_disabled ? "Enable" : "Disable"}</SubmitButton></form>
                  <details className="relative"><summary className="cursor-pointer list-none rounded-lg px-2 py-1 text-sm hover:bg-surface-2">Enroll…</summary>
                    <form action={A.grantEnrollmentAction} className="glass-strong absolute right-0 z-10 mt-1 flex w-72 flex-col gap-2 rounded-xl p-3"><input type="hidden" name="userId" value={r.id as string} />
                      <Select name="courseId" aria-label="Course">{courses.map((c) => <option key={c.id as string} value={c.id as string}>{c.title as string}</option>)}</Select><SubmitButton size="sm">Grant enrollment</SubmitButton></form>
                  </details>
                </span>) },
            ]} />
          <Pagination page={page} pages={Math.max(1, Math.ceil(((rows[0]?.total as number) ?? 0) / 25))} basePath="/admin/users" params={{ q, role }} />
        </>
      ) : (
        <Card className="divide-y divide-line">
          {reqs.length ? reqs.map((r) => (
            <div key={r.id as string} className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
              <div><Badge tone={r.kind === "DELETE" ? "danger" : "info"}>{r.kind as string}</Badge> <span className="font-medium">{r.full_name as string}</span> <span className="text-muted">{r.email as string}</span><p className="text-xs text-muted">{formatDateTime(r.created_at as string)}</p></div>
              {r.status === "PENDING" ? <span className="flex gap-2">
                <form action={A.handleDataRequestAction.bind(null, r.id as string, "COMPLETED")}><SubmitButton size="sm" variant={r.kind === "DELETE" ? "danger" : "primary"}>{r.kind === "DELETE" ? "Delete & anonymise" : "Mark exported"}</SubmitButton></form>
                <form action={A.handleDataRequestAction.bind(null, r.id as string, "REJECTED")}><SubmitButton size="sm" variant="ghost">Reject</SubmitButton></form>
              </span> : <StatusBadge status={r.status as string} />}
            </div>
          )) : <p className="p-6 text-center text-muted">No privacy requests.</p>}
        </Card>
      )}
    </div>
  );
}
