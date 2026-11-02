import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/session";
import { myResources } from "@/lib/services/student";
import { DataTable } from "@/components/ui/data";
import { PageHeader } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/Icon";
import { apiPath } from "@/lib/paths";

export const metadata: Metadata = { title: "Practical resources" };

export default async function ResourcesPage() {
  const user = await requireUser();
  const rows = await myResources(user);
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader eyebrow="Electronics bench" title="Practical resources" description="Datasheets, lab sheets and notes from your enrolled courses." />
      <DataTable rows={rows} rowKey={(r) => r.id as string} empty={{ title: "No resources yet", description: "Lesson PDFs uploaded by instructors appear here." }}
        columns={[
          { key: "t", header: "Resource", cell: (r) => <span className="flex items-center gap-2 font-medium"><Icon name="file" className="text-brand" />{r.title as string}</span> },
          { key: "c", header: "Course / lesson", cell: (r) => <span className="text-sm text-muted">{r.course_title as string} · {r.lesson_title as string}</span> },
          { key: "d", header: "", cell: (r) => <a className="inline-flex items-center gap-1 text-sm font-semibold text-brand-strong" href={apiPath(`/files/resource/${r.id}`)}><Icon name="download" size={14} />Download</a> },
        ]} />
    </div>
  );
}
