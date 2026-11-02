import type { Metadata } from "next";
import { listInstructors } from "@/lib/services/catalog";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/Icon";

export const metadata: Metadata = { title: "Instructors" };
export const revalidate = 300;

export default async function InstructorsPage() {
  const list = await listInstructors();
  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <PageHeader eyebrow="Instructors" title="The people behind the labs" description="Instructor profiles shown here are placeholders until Tierra Automation publishes its teaching team." />
      {list.length ? (
        <div className="grid gap-5 md:grid-cols-3">
          {list.map((i) => (
            <Card key={i.id as string} className="p-6">
              <span className="grid size-14 place-items-center rounded-2xl bg-surface-2 text-brand"><Icon name="user" size={24} /></span>
              <h2 className="mt-4 font-semibold">{i.display_name as string}</h2>
              <p className="text-sm text-muted">{i.headline as string}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">{(i.expertise as string[]).map((e) => <Badge key={e}>{e}</Badge>)}{i.is_demo && <Badge tone="warn">Demo profile</Badge>}</div>
              <p className="mt-3 text-sm text-fg-2">{i.bio as string}</p>
              <p className="mt-3 text-xs text-muted">{i.course_count as number} published courses</p>
            </Card>
          ))}
        </div>
      ) : <EmptyState title="Instructor profiles coming soon" />}
    </div>
  );
}
