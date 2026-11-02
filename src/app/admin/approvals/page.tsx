import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { asUser } from "@/lib/db/client";
import * as A from "../actions";
import { Flash, type SP } from "../Flash";
import { Badge, Card, EmptyState, Input, PageHeader } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/client";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Approvals · Admin" };

export default async function Approvals({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const user = await requirePermission("course.approve");
  const rows = await asUser(user, (tx) => tx`
    select r.*, c.title as course_title, c.status as course_status, p.full_name as requester, s.title as session_title, s.starts_at,
           v.entity_type, v.payload, v.entity_id
    from public.approval_requests r join public.courses c on c.id = r.course_id
    left join public.profiles p on p.id = r.requested_by left join public.live_sessions s on s.id = r.live_session_id
    left join public.content_revisions v on v.id = r.revision_id
    where r.status = 'PENDING' order by r.created_at`);
  const bind = (fn: unknown, ...a: unknown[]) => (fn as (...x: unknown[]) => unknown).bind(null, ...a) as (fd: FormData) => Promise<void>;
  return (
    <div className="mx-auto max-w-5xl">
      <Flash sp={sp} />
      <PageHeader eyebrow="Governance" title="Pending approvals" description="Course publishing requests, content revisions and live class proposals from Content Managers." />
      {rows.length ? (
        <div className="space-y-4">
          {rows.map((r) => (
            <Card key={r.id as string} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Badge tone={r.kind === "COURSE_PUBLISH" ? "brand" : r.kind === "REVISION" ? "info" : "warn"}>{String(r.kind).replace("_", " ").toLowerCase()}</Badge>
                  <h2 className="mt-2 font-semibold"><Link className="hover:text-brand-strong" href={`/admin/courses/${r.course_id}`}>{r.course_title as string}</Link></h2>
                  <p className="text-xs text-muted">Requested by {(r.requester as string) ?? "—"} · {formatDateTime(r.created_at as string)}</p>
                  {r.note && <p className="mt-2 text-sm">“{r.note as string}”</p>}
                  {r.kind === "LIVE_SESSION" && <p className="mt-2 text-sm">Session: <b>{r.session_title as string}</b> · {formatDateTime(r.starts_at as string)}</p>}
                  {r.kind === "REVISION" && (
                    <div className="mt-3 rounded-xl bg-surface-2 p-3 text-xs"><p className="mb-1 font-semibold">Proposed changes to {r.entity_type as string}</p>
                      <pre className="max-h-48 overflow-auto whitespace-pre-wrap font-mono">{JSON.stringify(r.payload, null, 2)}</pre></div>
                  )}
                </div>
              </div>
              <form className="mt-4 flex flex-col gap-2 sm:flex-row" action={
                r.kind === "COURSE_PUBLISH" ? bind(A.decideCourseAction, r.course_id, "approve") :
                r.kind === "REVISION" ? bind(A.decideRevisionAction, r.revision_id, true) : bind(A.decideLiveAction, r.live_session_id, true)}>
                <input type="hidden" name="from" value="/admin/approvals" />
                <Input name="comment" placeholder="Comment for the requester (required to reject)" aria-label="Comment" />
                {r.kind === "COURSE_PUBLISH" && <SubmitButton size="md" formAction={bind(A.decideCourseAction, r.course_id, "publish")}>Approve & publish</SubmitButton>}
                <SubmitButton size="md" variant={r.kind === "COURSE_PUBLISH" ? "outline" : "primary"}>{r.kind === "REVISION" ? "Apply revision" : "Approve"}</SubmitButton>
                <SubmitButton size="md" variant="ghost" formAction={
                  r.kind === "COURSE_PUBLISH" ? bind(A.decideCourseAction, r.course_id, "reject") :
                  r.kind === "REVISION" ? bind(A.decideRevisionAction, r.revision_id, false) : bind(A.decideLiveAction, r.live_session_id, false)}>Reject</SubmitButton>
              </form>
            </Card>
          ))}
        </div>
      ) : <EmptyState icon="check" title="All caught up" description="New requests from Content Managers will appear here." />}
    </div>
  );
}
