import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/session";
import { myAssignments } from "@/lib/services/student";
import { AssignmentForm } from "@/components/student/AssignmentForm";
import { Card, EmptyState, PageHeader, StatusBadge } from "@/components/ui/primitives";
import { formatDateTime } from "@/lib/format";
import { Markdown } from "@/components/student/Markdown";

export const metadata: Metadata = { title: "Assignments" };

export default async function AssignmentsPage() {
  const user = await requireUser();
  const rows = await myAssignments(user);
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader eyebrow="Practice" title="Assignments" description="Submit text, a link or a file. Graded assignments may count towards your certificate." />
      {rows.length ? (
        <div className="space-y-4">
          {rows.map((a) => (
            <Card key={a.id as string} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><p className="text-xs text-muted">{a.course_title as string}</p><h2 className="font-semibold">{a.title as string}</h2>
                  <p className="text-xs text-muted">{a.due_at ? `Due ${formatDateTime(a.due_at as string)}` : "No due date"} · pass {a.pass_points as number}/{a.max_points as number}</p></div>
                {a.status ? <StatusBadge status={a.status as string} /> : <StatusBadge status="PENDING" />}
              </div>
              {a.instructions && <div className="mt-3 text-sm"><Markdown source={a.instructions as string} /></div>}
              {a.status === "GRADED" ? (
                <div className="mt-4 rounded-xl bg-surface-2 p-4 text-sm"><p className="font-semibold">Score: {a.points as number}/{a.max_points as number}</p>{a.feedback && <p className="mt-1 text-fg-2">{a.feedback as string}</p>}</div>
              ) : (
                <AssignmentForm a={{ id: a.id as string, allowText: a.allow_text as boolean, allowLink: a.allow_link as boolean, allowFile: a.allow_file as boolean, maxFileMb: a.max_file_mb as number, text: (a.text_answer as string) ?? "", link: (a.link_url as string) ?? "", hasFile: Boolean(a.file_key) }} />
              )}
            </Card>
          ))}
        </div>
      ) : <EmptyState icon="inbox" title="No assignments yet" description="Assignments from your enrolled courses appear here." />}
    </div>
  );
}
