import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/session";
import { myPayments } from "@/lib/services/student";
import { DataTable } from "@/components/ui/data";
import { PageHeader, StatusBadge } from "@/components/ui/primitives";
import { RefundRequest } from "@/components/student/RefundRequest";
import { formatDateTime, formatMoney } from "@/lib/format";
import { REFUND_WINDOW_DAYS } from "@/lib/services/payments";

export const metadata: Metadata = { title: "Payments" };

export default async function PaymentsPage() {
  const user = await requireUser();
  const rows = await myPayments(user);
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader eyebrow="Billing" title="Payment history" description={`Your orders and receipts. Refunds can be requested within ${REFUND_WINDOW_DAYS} days of purchase.`} />
      <DataTable rows={rows} rowKey={(r) => r.id as string} empty={{ title: "No payments yet" }}
        columns={[
          { key: "c", header: "Course", cell: (r) => <div><p className="font-medium">{r.course_title as string}</p><p className="font-mono text-xs text-muted">{r.receipt as string}{r.provider === "demo" ? " · demo" : ""}</p></div> },
          { key: "d", header: "Date", cell: (r) => <span className="text-sm">{formatDateTime((r.paid_at ?? r.created_at) as string)}</span> },
          { key: "a", header: "Amount", cell: (r) => <span className="font-semibold">{formatMoney(r.amount_paise as number, r.currency as string)}{(r.discount_paise as number) > 0 && <span className="block text-xs font-normal text-muted">−{formatMoney(r.discount_paise as number)} coupon</span>}</span> },
          { key: "s", header: "Status", cell: (r) => <span className="flex flex-col items-start gap-1"><StatusBadge status={r.status as string} />{r.refund_status && <span className="text-xs text-muted">refund: {String(r.refund_status).toLowerCase()}</span>}</span> },
          { key: "r", header: "", cell: (r) => r.status === "PAID" && (r.amount_paise as number) > 0 && !r.refund_status && Date.now() - new Date(r.paid_at as string).getTime() < REFUND_WINDOW_DAYS * 86400000 ? <RefundRequest orderId={r.id as string} /> : null },
        ]} />
    </div>
  );
}
