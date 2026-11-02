import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { asUser } from "@/lib/db/client";
import * as A from "../actions";
import { Flash, type SP } from "../Flash";
import { DataTable, FilterBar, Pagination, pageParam, strParam } from "@/components/ui/data";
import { Badge, Card, Field, Input, PageHeader, Select } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/client";
import { formatDate } from "@/lib/format";
import { apiPath } from "@/lib/paths";

export const metadata: Metadata = { title: "Certificates · Admin" };

export default async function Certificates({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const user = await requirePermission("certificates.manage");
  const page = pageParam(sp.page), q = strParam(sp.q);
  const [rows, courses] = await asUser(user, async (tx) => [
    await tx`select k.*, p.email, count(*) over()::int as total from public.certificates k join public.profiles p on p.id = k.user_id
             where true ${q ? tx`and (k.verification_code ilike ${"%" + q + "%"} or p.email ilike ${"%" + q + "%"} or k.course_title ilike ${"%" + q + "%"})` : tx``}
             order by k.issued_at desc limit 25 offset ${(page - 1) * 25}`,
    await tx`select id, title from public.courses where status = 'PUBLISHED' order by title`,
  ]);
  return (
    <div className="mx-auto max-w-7xl">
      <Flash sp={sp} />
      <PageHeader eyebrow="Credentials" title="Certificates" description="Certificates are issued automatically when completion requirements are met. Re-evaluate a student below if a requirement changed." />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div>
          <FilterBar action="/admin/certificates"><Input name="q" defaultValue={q} placeholder="Code, email or course" aria-label="Search" className="max-w-sm" /></FilterBar>
          <DataTable rows={rows} rowKey={(r) => r.id as string} empty={{ title: "No certificates issued yet" }}
            columns={[
              { key: "c", header: "ID", cell: (r) => <Link className="font-mono text-xs hover:text-brand-strong" href={`/verify/${r.verification_code}`}>{r.verification_code as string}</Link> },
              { key: "n", header: "Recipient", cell: (r) => <span className="text-sm">{r.recipient_name as string}<span className="block text-xs text-muted">{r.email as string}</span></span> },
              { key: "t", header: "Course", cell: (r) => <span className="text-sm">{r.course_title as string}</span> },
              { key: "d", header: "Issued", cell: (r) => formatDate(r.issued_at as string) },
              { key: "x", header: "", cell: (r) => <span className="flex items-center gap-2"><a className="text-xs text-brand-strong" href={apiPath(`/certificates/${r.id}/pdf`)}>PDF</a>
                {r.revoked_at ? <><Badge tone="danger">revoked</Badge><form action={A.revokeCertificateAction.bind(null, r.id as string, false)}><SubmitButton size="sm" variant="ghost">Restore</SubmitButton></form></>
                  : <details><summary className="cursor-pointer text-xs text-danger">Revoke</summary><form action={A.revokeCertificateAction.bind(null, r.id as string, true)} className="mt-1 flex gap-1"><Input name="reason" placeholder="Reason" className="h-8 text-xs" aria-label="Reason" required /><SubmitButton size="sm" variant="danger">Revoke</SubmitButton></form></details>}</span> },
            ]} />
          <Pagination page={page} pages={Math.max(1, Math.ceil(((rows[0]?.total as number) ?? 0) / 25))} basePath="/admin/certificates" params={{ q }} />
        </div>
        <Card className="h-fit p-5">
          <h2 className="mb-3 font-semibold">Re-evaluate completion</h2>
          <form action={A.evaluateCertificateAction} className="grid gap-3">
            <Field label="Student user ID" htmlFor="userId" hint="From Students & users."><Input id="userId" name="userId" required pattern="[0-9a-fA-F-]{36}" /></Field>
            <Field label="Course" htmlFor="courseId"><Select id="courseId" name="courseId">{courses.map((c) => <option key={c.id as string} value={c.id as string}>{c.title as string}</option>)}</Select></Field>
            <SubmitButton variant="outline">Check & issue if eligible</SubmitButton>
          </form>
        </Card>
      </div>
    </div>
  );
}
