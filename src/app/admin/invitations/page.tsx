import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/session";
import { asUser } from "@/lib/db/client";
import { createInvitationAction, revokeInvitationAction } from "../actions";
import { Flash, type SP } from "../Flash";
import { DataTable } from "@/components/ui/data";
import { Alert, Badge, Card, Field, Input, PageHeader, Select } from "@/components/ui/primitives";
import { CopyButton, SubmitButton } from "@/components/ui/client";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Invitations · Admin" };

export default async function Invitations({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const user = await requirePermission("invitation.create");
  const sa = user.roles.includes("SUPER_ADMIN");
  const [rows, courses, sessions] = await asUser(user, async (tx) => [
    await tx`select i.*, c.title as course_title from public.invitations i left join public.courses c on c.id = i.course_id order by i.created_at desc limit 100`,
    await tx`select id, title, is_free from public.courses where public.manages_course(id) and status = 'PUBLISHED' order by title`,
    await tx`select s.id, s.title from public.live_sessions s where public.manages_course(s.course_id) and s.status = 'SCHEDULED' and s.starts_at > now() order by s.starts_at`,
  ]);
  const link = typeof sp.link === "string" ? sp.link : null;
  const wa = typeof sp.wa === "string" ? sp.wa : null;
  return (
    <div className="mx-auto max-w-6xl">
      <Flash sp={sp} />
      <PageHeader eyebrow="Growth" title="Invitations" description="Invite students by email, copyable link or WhatsApp. Links expire, can be revoked, and never bypass payment unless a Super Admin grants complimentary access." />
      {link && (
        <Card strong className="mb-6 p-5">
          <p className="font-semibold">Invitation created — copy the link now (it is shown only once).</p>
          <p className="mt-2 break-all rounded-lg bg-surface-2 p-3 font-mono text-xs">{link}</p>
          <div className="mt-3 flex flex-wrap gap-2"><CopyButton text={link} label="Copy link" />{wa && <a href={wa} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#25D366] px-3 text-sm font-semibold text-black">Share on WhatsApp</a>}</div>
        </Card>
      )}
      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <Card className="h-fit p-5">
          <h2 className="mb-3 font-semibold">New invitation</h2>
          <form action={createInvitationAction} className="grid gap-3">
            <Field label="Course" htmlFor="courseId"><Select id="courseId" name="courseId"><option value="">— none (live class only) —</option>{courses.map((c) => <option key={c.id as string} value={c.id as string}>{c.title as string}{c.is_free ? " (free)" : ""}</option>)}</Select></Field>
            <Field label="Live class (optional)" htmlFor="liveSessionId"><Select id="liveSessionId" name="liveSessionId"><option value="">—</option>{sessions.map((s) => <option key={s.id as string} value={s.id as string}>{s.title as string}</option>)}</Select></Field>
            <Field label="Email (optional — binds the invite to this address)" htmlFor="email"><Input id="email" name="email" type="email" /></Field>
            <div className="grid grid-cols-2 gap-3"><Field label="Max uses" htmlFor="maxUses"><Input id="maxUses" name="maxUses" type="number" min="1" max="1000" defaultValue="1" /></Field><Field label="Expires in (days)" htmlFor="days"><Input id="days" name="days" type="number" min="1" max="90" defaultValue="14" /></Field></div>
            {sa ? <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="complimentary" className="mt-1 accent-[var(--brand)]" /><span>Grant <b>complimentary access</b> to a paid course (Super Admin only, audited)</span></label>
                : <Alert tone="info">Paid-course invitations send students to checkout. Only a Super Admin can grant complimentary access.</Alert>}
            <SubmitButton>Create invitation</SubmitButton>
          </form>
        </Card>
        <DataTable rows={rows} rowKey={(r) => r.id as string} empty={{ title: "No invitations yet" }}
          columns={[
            { key: "c", header: "Target", cell: (r) => <span className="text-sm">{(r.course_title as string) ?? "Live class"}{r.grants_complimentary && <Badge tone="brand" className="ml-2">complimentary</Badge>}</span> },
            { key: "e", header: "Email", cell: (r) => <span className="text-sm text-muted">{(r.email as string) ?? "anyone with link"}</span> },
            { key: "u", header: "Used", cell: (r) => `${r.use_count}/${r.max_uses}` },
            { key: "x", header: "Expires", cell: (r) => <span className="text-xs">{formatDate(r.expires_at as string)}</span> },
            { key: "s", header: "", cell: (r) => r.revoked_at ? <Badge tone="danger">revoked</Badge> : new Date(r.expires_at as string) < new Date() ? <Badge>expired</Badge> : <form action={revokeInvitationAction.bind(null, r.id as string)}><SubmitButton size="sm" variant="ghost">Revoke</SubmitButton></form> },
          ]} />
      </div>
    </div>
  );
}
