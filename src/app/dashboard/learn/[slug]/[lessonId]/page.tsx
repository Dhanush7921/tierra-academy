import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { learnData } from "@/lib/services/student";
import { LessonPlayer } from "@/components/student/LessonPlayer";
import { MarkDoneButton } from "@/components/student/MarkDoneButton";
import { Markdown } from "@/components/student/Markdown";
import { Badge, Card, ProgressBar, StatusBadge, buttonClass, cx } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/Icon";
import { formatDuration } from "@/lib/format";
import { apiPath } from "@/lib/paths";

export const metadata: Metadata = { title: "Learning" };

export default async function LessonPage({ params }: { params: Promise<{ slug: string; lessonId: string }> }) {
  const { slug, lessonId } = await params;
  const user = await requireUser();
  const d = await learnData(user, slug, lessonId);
  if (!d) notFound();
  if (!d.course.enrolled && !d.course.staff) redirect(`/courses/${slug}`);
  const l = d.current;
  if (!l) redirect(`/courses/${slug}`);
  const idx = d.lessons.findIndex((x) => x.id === l.id);
  const prev = d.lessons[idx - 1], next = d.lessons[idx + 1];
  const modules = [...new Map(d.lessons.map((x) => [x.module_id as string, x.module_title as string])).entries()];

  return (
    <div className="mx-auto grid max-w-7xl gap-6 xl:grid-cols-[1fr_340px]">
      <div className="min-w-0 space-y-5">
        <nav aria-label="Breadcrumb" className="text-sm text-muted"><Link href="/dashboard/courses" className="hover:text-fg">My courses</Link> / <Link href={`/courses/${slug}`} className="hover:text-fg">{d.course.title as string}</Link></nav>
        {l.kind === "VIDEO" && l.video_asset_id ? (
          <LessonPlayer lessonId={l.id as string} />
        ) : l.kind === "LIVE" ? (
          <Card className="grid aspect-video place-items-center p-6 text-center">
            <div><Icon name="video" size={36} className="mx-auto text-info" /><p className="mt-3 font-display text-lg font-semibold">Live session lesson</p><p className="mt-1 text-sm text-muted">Join the class from your live schedule. Recordings appear here when available.</p>
              <Link href="/dashboard/live" className={buttonClass("primary", "md", "mt-4")}>Open live schedule</Link></div>
          </Card>
        ) : l.kind === "VIDEO" ? (
          <Card className="grid aspect-video place-items-center p-6 text-center text-muted">Video coming soon for this lesson.</Card>
        ) : null}

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="label-mono">Lesson {idx + 1} of {d.lessons.length} · {String(l.kind).toLowerCase()}</p>
            <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight">{l.title as string}</h1>
            {l.summary && <p className="mt-1 text-muted">{l.summary as string}</p>}
          </div>
          {l.completed ? <Badge tone="ok">✓ Completed</Badge> : l.kind !== "VIDEO" && d.course.enrolled ? <MarkDoneButton lessonId={l.id as string} /> : null}
        </div>

        {l.body && <Card className="p-6"><Markdown source={l.body as string} /></Card>}

        {d.resources.length > 0 && (
          <Card className="p-5">
            <h2 className="mb-3 font-semibold">Lesson resources</h2>
            <ul className="space-y-2">
              {d.resources.map((r) => (
                <li key={r.id as string}><a href={apiPath(`/files/resource/${r.id}`)} className="flex items-center gap-3 rounded-xl p-2 hover:bg-surface-2"><Icon name="file" className="text-brand" /><span className="flex-1 text-sm font-medium">{r.title as string}</span><span className="text-xs text-muted">{Math.ceil((r.size_bytes as number) / 1024)} KB</span><Icon name="download" size={16} /></a></li>
              ))}
            </ul>
          </Card>
        )}

        <div className="flex justify-between gap-3">
          {prev ? <Link href={`/dashboard/learn/${slug}/${prev.id}`} className={buttonClass("outline", "md")}><Icon name="arrowLeft" size={16} />Previous</Link> : <span />}
          {next ? <Link href={`/dashboard/learn/${slug}/${next.id}`} className={buttonClass("primary", "md")}>Next lesson<Icon name="arrow" size={16} /></Link> : <Link href="/dashboard/certificates" className={buttonClass("primary", "md")}>Finish course<Icon name="award" size={16} /></Link>}
        </div>
      </div>

      <aside className="space-y-4 xl:sticky xl:top-20 xl:self-start">
        <Card className="p-4">
          <p className="text-sm font-semibold">{d.course.title as string}</p>
          <div className="mt-3 flex items-center gap-3"><div className="flex-1"><ProgressBar value={d.enrollment?.progress ?? 0} /></div><span className="text-xs text-muted">{Math.round(d.enrollment?.progress ?? 0)}%</span></div>
        </Card>
        <Card className="max-h-[60vh] overflow-y-auto p-2">
          <nav aria-label="Course lessons">
            {modules.map(([mid, mtitle]) => (
              <div key={mid} className="mb-2">
                <p className="label-mono px-3 py-2">{mtitle}</p>
                <ul>
                  {d.lessons.filter((x) => x.module_id === mid).map((x) => (
                    <li key={x.id as string}>
                      <Link href={`/dashboard/learn/${slug}/${x.id}`} aria-current={x.id === l.id ? "page" : undefined}
                        className={cx("flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm", x.id === l.id ? "bg-surface-2 font-semibold" : "hover:bg-surface-2")}>
                        <span className={cx("grid size-5 shrink-0 place-items-center rounded-full border text-[10px]", x.completed ? "border-ok bg-ok text-white" : "border-line-strong")}>{x.completed ? "✓" : ""}</span>
                        <span className="flex-1 truncate">{x.title as string}</span>
                        <span className="text-xs text-muted">{formatDuration(x.duration_seconds as number)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </Card>
        {(d.quizzes.length > 0 || d.assignments.length > 0) && (
          <Card className="p-4">
            <p className="mb-2 text-sm font-semibold">Assessments</p>
            <ul className="space-y-1.5 text-sm">
              {d.quizzes.map((q) => <li key={q.id as string}><Link className="flex items-center gap-2 hover:text-brand-strong" href={`/dashboard/quizzes/${q.id}`}><Icon name="check" size={15} />{q.title as string}<span className="text-xs text-muted">pass {q.pass_percent as number}%</span></Link></li>)}
              {d.assignments.map((a) => <li key={a.id as string}><Link className="flex items-center gap-2 hover:text-brand-strong" href="/dashboard/assignments"><Icon name="inbox" size={15} />{a.title as string} {a.submission_status && <StatusBadge status={a.submission_status as string} />}</Link></li>)}
            </ul>
          </Card>
        )}
      </aside>
    </div>
  );
}
