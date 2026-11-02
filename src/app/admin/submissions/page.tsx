import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/session";
import { asService, asUser } from "@/lib/db/client";
import { gradeAction } from "../actions";
import { Flash, type SP } from "../Flash";
import { Card, EmptyState, Input, PageHeader, StatusBadge, Textarea } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/client";
import { formatDateTime } from "@/lib/format";
import { apiPath } from "@/lib/paths";

export const metadata: Metadata = { title: "Submissions · Admin" };

export default async function Submissions({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const user = await requirePermission("assignment.grade");
  const showAll = sp.all === "1";
  const subs = await asUser(user, (tx) => tx`
    select s.*, a.title, a.max_points, a.pass_points, c.title as course_title from public.submissions s
    join public.assignments a on a.id = s.assignment_id join public.courses c on c.id = a.course_id
    where ${showAll ? tx`true` : tx`s.status = 'SUBMITTED'`} order by s.submitted_at limit 100`);
  // grader sees the student's name for submissions they are allowed to read (RLS above)
  const names = subs.length ? await asService((tx) => tx`select id, full_name, email from public.profiles where id = any(${subs.map((s) => s.user_id as string)})`) : [];
  const nameOf = (id: string) => names.find((n) => n.id === id);
  const bind = (id: string) => gradeAction.bind(null, id);
  return (
    <div className="mx-auto max-w-4xl">
      <Flash sp={sp} />
      <PageHeader eyebrow="Assessment" title="Assignment submissions" description="Only submissions for courses you manage are listed." actions={<a className="text-sm text-brand-strong" href={showAll ? "/admin/submissions" : "/admin/submissions?all=1"}>{showAll ? "Show ungraded only" : "Show all"}</a>} />
      {subs.length ? <div className="space-y-4">{subs.map((s) => (
        <Card key={s.id as string} className="p-5">
          <div className="flex flex-wrap justify-between gap-2"><div><p className="text-xs text-muted">{s.course_title as string}</p><h2 className="font-semibold">{s.title as string}</h2><p className="text-sm">{nameOf(s.user_id as string)?.full_name as string} <span className="text-muted">· {formatDateTime(s.submitted_at as string)}</span></p></div><StatusBadge status={s.status as string} /></div>
          {s.text_answer && <p className="mt-3 whitespace-pre-wrap rounded-xl bg-surface-2 p-3 text-sm">{s.text_answer as string}</p>}
          {s.link_url && <p className="mt-2 text-sm">Link: <a className="text-brand-strong underline" href={s.link_url as string} target="_blank" rel="noopener noreferrer nofollow">{s.link_url as string}</a></p>}
          {s.file_key && <p className="mt-2 text-sm"><a className="text-brand-strong underline" href={apiPath(`/files/submission/${s.id}`)}>Download attached file</a></p>}
          <form action={bind(s.id as string)} className="mt-4 grid gap-2 sm:grid-cols-[120px_1fr_auto]">
            <Input name="points" type="number" min="0" max={s.max_points as number} defaultValue={(s.points as number) ?? ""} placeholder={`/ ${s.max_points}`} aria-label="Points" required />
            <Textarea name="feedback" rows={1} defaultValue={(s.feedback as string) ?? ""} placeholder="Feedback for the student" aria-label="Feedback" />
            <SubmitButton size="md">Save grade</SubmitButton>
          </form>
        </Card>
      ))}</div> : <EmptyState icon="inbox" title="Nothing to grade" />}
    </div>
  );
}
