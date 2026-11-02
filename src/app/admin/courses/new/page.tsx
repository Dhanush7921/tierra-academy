import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/session";
import { asUser } from "@/lib/db/client";
import { createCourseAction } from "../../actions";
import { Card, Field, Input, PageHeader, Select } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/client";
import { Flash, type SP } from "../../Flash";

export const metadata: Metadata = { title: "New course · Admin" };

export default async function NewCourse({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const user = await requirePermission("course.create");
  const cats = await asUser(user, (tx) => tx`select id, name from public.course_categories order by sort_order`);
  return (
    <div className="mx-auto max-w-2xl">
      <Flash sp={sp} />
      <PageHeader eyebrow="Content" title="New course draft" description="Drafts are private. Submit for review when ready — a Super Admin sets pricing and publishes." />
      <Card strong className="p-6">
        <form action={createCourseAction} className="grid gap-4">
          <Field label="Title" htmlFor="title"><Input id="title" name="title" required minLength={3} maxLength={160} /></Field>
          <Field label="Subtitle" htmlFor="subtitle"><Input id="subtitle" name="subtitle" maxLength={240} /></Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Discipline" htmlFor="categoryId"><Select id="categoryId" name="categoryId" required>{cats.map((c) => <option key={c.id as string} value={c.id as string}>{c.name as string}</option>)}</Select></Field>
            <Field label="Format" htmlFor="delivery"><Select id="delivery" name="delivery"><option value="RECORDED">Recorded</option><option value="LIVE">Live</option><option value="HYBRID">Hybrid</option></Select></Field>
            <Field label="Level" htmlFor="level"><Select id="level" name="level"><option value="BEGINNER">Beginner</option><option value="INTERMEDIATE">Intermediate</option><option value="ADVANCED">Advanced</option></Select></Field>
          </div>
          <div><SubmitButton pendingText="Creating…">Create draft</SubmitButton></div>
        </form>
      </Card>
    </div>
  );
}
