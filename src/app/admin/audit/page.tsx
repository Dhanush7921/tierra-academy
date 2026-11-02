import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/session";
import { asUser } from "@/lib/db/client";
import { DataTable, FilterBar, Pagination, pageParam, strParam } from "@/components/ui/data";
import { Input, PageHeader } from "@/components/ui/primitives";
import { formatDateTime } from "@/lib/format";
import type { SP } from "../Flash";

export const metadata: Metadata = { title: "Audit log · Admin" };

export default async function Audit({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const user = await requirePermission("audit.view");
  const page = pageParam(sp.page), action = strParam(sp.action), actor = strParam(sp.actor);
  const rows = await asUser(user, (tx) => tx`
    select a.*, p.email, count(*) over()::int as total from public.audit_logs a left join public.profiles p on p.id = a.actor_id
    where true ${action ? tx`and a.action ilike ${action + "%"}` : tx``} ${actor ? tx`and p.email ilike ${"%" + actor + "%"}` : tx``}
    order by a.created_at desc limit 50 offset ${(page - 1) * 50}`);
  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader eyebrow="Security" title="Audit log" description="Append-only record of sign-ins, content decisions, pricing, payments, refunds, role changes and privacy actions." />
      <FilterBar action="/admin/audit"><Input name="action" defaultValue={action} placeholder="Action prefix e.g. course." aria-label="Action" className="max-w-xs" /><Input name="actor" defaultValue={actor} placeholder="Actor email" aria-label="Actor" className="max-w-xs" /></FilterBar>
      <DataTable rows={rows} rowKey={(r) => String(r.id)} empty={{ title: "No audit entries" }}
        columns={[
          { key: "t", header: "Time", cell: (r) => <span className="whitespace-nowrap text-xs">{formatDateTime(r.created_at as string)}</span> },
          { key: "a", header: "Action", cell: (r) => <span className="font-mono text-xs text-brand-strong">{r.action as string}</span> },
          { key: "u", header: "Actor", cell: (r) => <span className="text-xs">{(r.email as string) ?? "system"}{r.actor_role ? ` · ${r.actor_role}` : ""}</span> },
          { key: "e", header: "Entity", cell: (r) => <span className="text-xs text-muted">{r.entity_type as string} {r.entity_id ? String(r.entity_id).slice(0, 36) : ""}</span> },
          { key: "m", header: "Details", cell: (r) => <code className="block max-w-xs truncate text-[11px] text-muted">{JSON.stringify(r.metadata)}</code> },
        ]} />
      <Pagination page={page} pages={Math.max(1, Math.ceil(((rows[0]?.total as number) ?? 0) / 50))} basePath="/admin/audit" params={{ action, actor }} />
    </div>
  );
}
