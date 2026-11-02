import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { asUser } from "@/lib/db/client";
import * as A from "../actions";
import { Flash, type SP } from "../Flash";
import { DataTable, FilterBar, Pagination, pageParam, strParam } from "@/components/ui/data";
import { Badge, Input, PageHeader, Select, StatusBadge, cx } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/client";
import { formatDateTime, formatMoney } from "@/lib/format";

export const metadata: Metadata = { title: "Orders & refunds · Admin" };
const STATUSES = ["CREATED", "PENDING", "PAID", "FAILED", "CANCELLED", "REFUNDED", "PARTIALLY_REFUNDED"];

export default async function Orders({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const user = await requirePermission("orders.manage");
  const tab = sp.tab === "refunds" ? "refunds" : "orders";
  const page = pageParam(sp.page), q = strParam(sp.q), status = STATUSES.includes(strParam(sp.status) ?? "") ? strParam(sp.status) : undefined;
  const [orders, refunds] = await asUser(user, async (tx) => [
    tab === "orders" ? await tx`select o.*, c.title as course_title, p.email, count(*) over()::int as total from public.orders o
      join public.courses c on c.id = o.course_id join public.profiles p on p.id = o.user_id
      where true ${status ? tx`and o.status = ${status}` : tx``} ${q ? tx`and (o.receipt ilike ${"%" + q + "%"} or p.email ilike ${"%" + q + "%"})` : tx``}
      order by o.created_at desc limit 25 offset ${(page - 1) * 25}` : [],
    tab === "refunds" ? await tx`select r.*, o.receipt, o.provider, c.title as course_title, p.email from public.refunds r join public.orders o on o.id = r.order_id
      join public.courses c on c.id = o.course_id join public.profiles p on p.id = r.user_id order by (r.status = 'REQUESTED') desc, r.created_at desc limit 100` : [],
  ]);
  return (
    <div className="mx-auto max-w-7xl">
      <Flash sp={sp} />
      <PageHeader eyebrow="Commerce" title="Orders & refunds" description="Payment status comes only from verified provider events. Demo-mode orders are labelled." />
      <nav className="mb-4 flex gap-1 border-b border-line">{[["orders", "Orders"], ["refunds", "Refund requests"]].map(([k, l]) => <Link key={k} href={`/admin/orders?tab=${k}`} className={cx("border-b-2 px-3 py-2 text-sm", tab === k ? "border-brand" : "border-transparent text-muted")}>{l}</Link>)}</nav>
      {tab === "orders" ? (
        <>
          <FilterBar action="/admin/orders"><Input name="q" defaultValue={q} placeholder="Receipt or email" aria-label="Search" className="max-w-xs" />
            <Select name="status" defaultValue={status ?? ""} aria-label="Status" className="max-w-[200px]"><option value="">Any status</option>{STATUSES.map((s) => <option key={s}>{s}</option>)}</Select></FilterBar>
          <DataTable rows={orders} rowKey={(r) => r.id as string} empty={{ title: "No orders" }}
            columns={[
              { key: "r", header: "Receipt", cell: (r) => <span className="font-mono text-xs">{r.receipt as string}{r.provider === "demo" && <Badge tone="warn" className="ml-2">demo</Badge>}</span> },
              { key: "u", header: "Student", cell: (r) => <span className="text-sm">{r.email as string}</span> },
              { key: "c", header: "Course", cell: (r) => <span className="text-sm">{r.course_title as string}</span> },
              { key: "a", header: "Amount", cell: (r) => <span className="font-semibold">{formatMoney(r.amount_paise as number, r.currency as string)}</span> },
              { key: "s", header: "Status", cell: (r) => <StatusBadge status={r.status as string} /> },
              { key: "d", header: "Date", cell: (r) => <span className="text-xs">{formatDateTime(r.created_at as string)}</span> },
              { key: "x", header: "", cell: (r) => r.status === "PAID" && (r.amount_paise as number) > 0 ? <details><summary className="cursor-pointer text-sm text-brand-strong">Refund</summary><form action={A.adminRefundOrderAction.bind(null, r.id as string)} className="mt-2 flex gap-1"><Input name="reason" placeholder="Reason" className="h-8 text-xs" aria-label="Reason" /><SubmitButton size="sm" variant="danger">Issue</SubmitButton></form></details> : null },
            ]} />
          <Pagination page={page} pages={Math.max(1, Math.ceil(((orders[0]?.total as number) ?? 0) / 25))} basePath="/admin/orders" params={{ q, status, tab }} />
        </>
      ) : (
        <DataTable rows={refunds} rowKey={(r) => r.id as string} empty={{ title: "No refund requests" }}
          columns={[
            { key: "r", header: "Order", cell: (r) => <span className="font-mono text-xs">{r.receipt as string}</span> },
            { key: "u", header: "Student / course", cell: (r) => <span className="text-sm">{r.email as string}<span className="block text-xs text-muted">{r.course_title as string}</span></span> },
            { key: "a", header: "Amount", cell: (r) => formatMoney(r.amount_paise as number) },
            { key: "w", header: "Reason", cell: (r) => <span className="text-sm text-fg-2">{(r.reason as string) || "—"}</span> },
            { key: "s", header: "Status", cell: (r) => <StatusBadge status={r.status as string} /> },
            { key: "x", header: "", cell: (r) => ["REQUESTED", "FAILED"].includes(r.status as string) ? <form className="flex flex-col gap-1" action={A.decideRefundAction.bind(null, r.id as string, true)}><Input name="note" placeholder="Note" className="h-8 text-xs" aria-label="Note" /><span className="flex gap-1"><SubmitButton size="sm">Approve</SubmitButton><SubmitButton size="sm" variant="ghost" formAction={A.decideRefundAction.bind(null, r.id as string, false)}>Decline</SubmitButton></span></form> : null },
          ]} />
      )}
    </div>
  );
}
