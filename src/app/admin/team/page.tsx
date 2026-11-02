import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/session";
import { asUser } from "@/lib/db/client";
import * as A from "../actions";
import { Flash, type SP } from "../Flash";
import { Card, EmptyState, Field, Input, PageHeader } from "@/components/ui/primitives";
import { ConfirmSubmit, SubmitButton } from "@/components/ui/client";

export const metadata: Metadata = { title: "Content team · Admin" };

export default async function Team({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const user = await requirePermission("team.manage");
  const cms = await asUser(user, (tx) => tx`
    select p.id, p.full_name, p.email, p.is_disabled,
           coalesce(array_agg(c.title order by c.title) filter (where c.id is not null), '{}') as courses
    from public.profiles p join public.user_roles r on r.user_id = p.id and r.role = 'CONTENT_MANAGER'
    left join public.content_manager_assignments a on a.user_id = p.id left join public.courses c on c.id = a.course_id
    group by p.id order by p.full_name`);
  return (
    <div className="mx-auto max-w-6xl">
      <Flash sp={sp} />
      <PageHeader eyebrow="Team" title="Content Managers" description="Content Managers create drafts, upload media, build quizzes and host assigned classes. They cannot publish, change prices, see revenue, issue refunds or change settings." />
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-3">
          {cms.length ? cms.map((m) => (
            <Card key={m.id as string} className="flex flex-wrap items-start justify-between gap-3 p-5">
              <div><p className="font-semibold">{m.full_name as string}</p><p className="text-sm text-muted">{m.email as string}</p>
                <p className="mt-2 text-xs text-muted">Assigned: {(m.courses as string[]).length ? (m.courses as string[]).join(" · ") : "no courses yet (assign from a course's Team tab)"}</p></div>
              <form action={A.setRoleAction.bind(null, m.id as string, "CONTENT_MANAGER", false, "/admin/team")}><ConfirmSubmit confirmText="Remove role and all assignments?">Remove role</ConfirmSubmit></form>
            </Card>
          )) : <EmptyState icon="shield" title="No Content Managers yet" />}
        </div>
        <Card className="h-fit p-5">
          <h2 className="mb-3 font-semibold">Add a Content Manager</h2>
          <form action={A.createContentManagerAction} className="grid gap-3">
            <Field label="Full name" htmlFor="fullName"><Input id="fullName" name="fullName" required /></Field>
            <Field label="Email" htmlFor="email" hint="If the email already has an account, it is promoted."><Input id="email" name="email" type="email" required /></Field>
            <Field label="Temporary password (new accounts)" htmlFor="password" hint="10+ chars with a letter and number. Share securely."><Input id="password" name="password" type="password" autoComplete="new-password" /></Field>
            <SubmitButton>Add Content Manager</SubmitButton>
          </form>
        </Card>
      </div>
    </div>
  );
}
