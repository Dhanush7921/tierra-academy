import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/session";
import { asUser } from "@/lib/db/client";
import { Pagination, pageParam } from "@/components/ui/data";
import { Card, EmptyState, PageHeader, StatusBadge } from "@/components/ui/primitives";
import { formatDateTime } from "@/lib/format";
import { env } from "@/lib/env";
import type { SP } from "../Flash";

export const metadata: Metadata = { title: "Email outbox · Admin" };

export default async function Outbox({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const page = pageParam(sp.page);
  const user = await requirePermission("outbox.view");
  const rows = await asUser(user, (tx) => tx`select *, count(*) over()::int as total from public.email_outbox order by created_at desc limit 20 offset ${(page - 1) * 20}`);
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader eyebrow="Messaging" title="Email outbox" description={env().EMAIL_PROVIDER === "outbox" ? "DEVELOPMENT OUTBOX — emails are stored here and not delivered. Configure EMAIL_PROVIDER=resend to send." : "Delivery log for transactional emails."} />
      {rows.length ? <div className="space-y-3">{rows.map((m) => (
        <Card key={m.id as string} className="p-0">
          <details>
            <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 p-4 text-sm"><span><span className="font-semibold">{m.subject as string}</span><span className="block text-xs text-muted">to {m.to_email as string} · {formatDateTime(m.created_at as string)}</span></span><StatusBadge status={m.status as string} /></summary>
            <iframe title={`Email: ${m.subject}`} sandbox="" srcDoc={m.html as string} className="h-80 w-full border-t border-line bg-white" />
          </details>
        </Card>
      ))}</div> : <EmptyState icon="mail" title="No emails yet" />}
      <Pagination page={page} pages={Math.max(1, Math.ceil(((rows[0]?.total as number) ?? 0) / 20))} basePath="/admin/outbox" />
    </div>
  );
}
