import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/session";
import { asUser } from "@/lib/db/client";
import { courseAnalytics } from "@/lib/services/analytics";
import * as A from "../../actions";
import { Flash, type SP } from "../../Flash";
import { Alert, Badge, Card, EmptyState, Field, Input, PageHeader, Select, StatusBadge, Textarea, buttonClass, cx } from "@/components/ui/primitives";
import { ConfirmSubmit, SubmitButton } from "@/components/ui/client";
import { VideoUploader } from "@/components/admin/VideoUploader";
import { BarChart } from "@/components/ui/charts";
import { formatDateTime, formatDuration, formatMoney } from "@/lib/format";

export const metadata: Metadata = { title: "Edit course · Admin" };
const TABS = [["details", "Details"], ["curriculum", "Curriculum"], ["media", "Media"], ["assessments", "Assessments"], ["pricing", "Pricing"], ["team", "Team"], ["history", "Review history"], ["analytics", "Analytics"]] as const;
const toLocal = (d: unknown) => (d ? new Date(d as string).toISOString().slice(0, 16) : "");

export default async function CourseEditor({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const { id } = await params;
  const sp = await searchParams;
  const tab = (TABS.find(([k]) => k === sp.tab)?.[0] ?? "details") as (typeof TABS)[number][0];
  const user = await requirePermission("course.editAssigned");
  const sa = user.roles.includes("SUPER_ADMIN");
  const data = await asUser(user, async (tx) => {
    const [c] = await tx`select c.*, c.estimated_hours::float as estimated_hours, public.manages_course(c.id) as manages from public.courses c where c.id = ${id}`;
    if (!c) return null;
    const [cats, instructors, modules, lessons, assets, resources, quizzes, questions, assignments, history, revisions] = await Promise.all([
      tx`select id, name from public.course_categories order by sort_order`,
      tx`select id, display_name from public.instructor_profiles order by display_name`,
      tx`select * from public.course_modules where course_id = ${id} order by position`,
      tx`select * from public.lessons where course_id = ${id} order by position`,
      tx`select id, original_filename, status, duration_seconds, provider, created_at from public.video_assets where course_id = ${id} or (course_id is null and provider = 'sample') order by created_at desc`,
      tx`select id, lesson_id, title, mime_type, size_bytes from public.lesson_resources where course_id = ${id}`,
      tx`select * from public.quizzes where course_id = ${id} order by created_at`,
      tx`select q.* from public.questions q join public.quizzes z on z.id = q.quiz_id where z.course_id = ${id} order by q.position`,
      tx`select * from public.assignments where course_id = ${id} order by created_at`,
      tx`select r.*, p.full_name as requester, d.full_name as decider from public.approval_requests r left join public.profiles p on p.id = r.requested_by left join public.profiles d on d.id = r.decided_by where r.course_id = ${id} order by r.created_at desc`,
      tx`select * from public.content_revisions where course_id = ${id} order by created_at desc`,
    ]);
    const managers = sa ? await tx`select p.id, p.full_name, p.email, exists (select 1 from public.content_manager_assignments a where a.user_id = p.id and a.course_id = ${id}) as assigned
                                   from public.profiles p join public.user_roles r on r.user_id = p.id and r.role = 'CONTENT_MANAGER' order by p.full_name` : [];
    return { c, cats, instructors, modules, lessons, assets, resources, quizzes, questions, assignments, history, revisions, managers };
  });
  if (!data) notFound();
  const { c } = data;
  const editable = sa || ["DRAFT", "REJECTED"].includes(c.status as string);
  const analytics = tab === "analytics" ? await courseAnalytics(user, id) : null;
  const B = (fn: (...a: never[]) => unknown, ...args: unknown[]) => (fn as (...a: unknown[]) => unknown).bind(null, ...args) as (fd: FormData) => Promise<void>;

  return (
    <div className="mx-auto max-w-6xl">
      <Flash sp={sp} />
      <PageHeader eyebrow={<span className="flex items-center gap-2">Course editor <StatusBadge status={c.status as string} />{c.is_demo && <Badge tone="warn">demo</Badge>}</span>} title={c.title as string}
        actions={<>
          <Link href={`/courses/${c.slug}`} className={buttonClass("outline", "sm")} target="_blank">Preview</Link>
          {["DRAFT", "REJECTED"].includes(c.status as string) && (
            <form action={B(A.submitReviewAction, id)} className="flex gap-2"><input name="note" placeholder="Note for reviewer" className="h-8 rounded-lg border border-line-strong bg-surface px-2 text-sm" aria-label="Note for reviewer" /><SubmitButton size="sm">Submit for review</SubmitButton></form>
          )}
          {sa && ["REVIEW", "APPROVED", "DRAFT", "REJECTED"].includes(c.status as string) && <form action={B(A.decideCourseAction, id, "publish")}><input type="hidden" name="comment" value="Published by Super Admin" /><SubmitButton size="sm">Publish</SubmitButton></form>}
          {sa && c.status === "PUBLISHED" && <form action={B(A.archiveCourseAction, id, true)}><ConfirmSubmit confirmText="Archive and hide from catalogue?">Archive</ConfirmSubmit></form>}
          {sa && c.status === "ARCHIVED" && <form action={B(A.archiveCourseAction, id, false)}><SubmitButton size="sm" variant="outline">Restore as draft</SubmitButton></form>}
        </>} />
      {c.status === "REVIEW" && sa && (
        <Card className="mb-5 p-4">
          <p className="mb-2 text-sm font-semibold">This course is awaiting your review</p>
          <form className="flex flex-col gap-2 sm:flex-row" action={B(A.decideCourseAction, id, "approve")}>
            <Input name="comment" placeholder="Comment for the author (required to reject)" />
            <SubmitButton size="sm">Approve</SubmitButton>
            <SubmitButton size="sm" variant="outline" formAction={B(A.decideCourseAction, id, "reject")}>Reject</SubmitButton>
          </form>
        </Card>
      )}
      {!editable && <div className="mb-5"><Alert tone="info">This course is {String(c.status).toLowerCase()}. Your edits will be submitted as <b>revisions</b> that a Super Admin approves before they go live.</Alert></div>}

      <nav aria-label="Editor sections" className="mb-5 flex gap-1 overflow-x-auto border-b border-line">
        {TABS.filter(([k]) => sa || !["team"].includes(k)).map(([k, label]) => (
          <Link key={k} href={`/admin/courses/${id}?tab=${k}`} aria-current={tab === k ? "page" : undefined}
            className={cx("whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium", tab === k ? "border-brand text-fg" : "border-transparent text-muted hover:text-fg")}>{label}</Link>
        ))}
      </nav>

      {tab === "details" && (
        <Card className="p-6">
          <form action={B(A.updateCourseAction, id)} className="grid gap-4 md:grid-cols-2" encType="multipart/form-data">
            <Field label="Title" htmlFor="title" className="md:col-span-2"><Input id="title" name="title" defaultValue={c.title as string} required /></Field>
            <Field label="Subtitle" htmlFor="subtitle" className="md:col-span-2"><Input id="subtitle" name="subtitle" defaultValue={c.subtitle as string} /></Field>
            <Field label="Description" htmlFor="description" className="md:col-span-2"><Textarea id="description" name="description" defaultValue={c.description as string} rows={6} /></Field>
            <Field label="Requirements (one per line)" htmlFor="requirements"><Textarea id="requirements" name="requirements" defaultValue={(c.requirements as string[]).join("\n")} /></Field>
            <Field label="Learning outcomes (one per line)" htmlFor="outcomes"><Textarea id="outcomes" name="outcomes" defaultValue={(c.outcomes as string[]).join("\n")} /></Field>
            <Field label="Discipline" htmlFor="category_id"><Select id="category_id" name="category_id" defaultValue={c.category_id as string}>{data.cats.map((x) => <option key={x.id as string} value={x.id as string}>{x.name as string}</option>)}</Select></Field>
            <Field label="Instructor" htmlFor="instructor_id"><Select id="instructor_id" name="instructor_id" defaultValue={(c.instructor_id as string) ?? ""}><option value="">—</option>{data.instructors.map((x) => <option key={x.id as string} value={x.id as string}>{x.display_name as string}</option>)}</Select></Field>
            <Field label="Format" htmlFor="delivery"><Select id="delivery" name="delivery" defaultValue={c.delivery as string}><option value="RECORDED">Recorded</option><option value="LIVE">Live</option><option value="HYBRID">Hybrid</option></Select></Field>
            <Field label="Level" htmlFor="level"><Select id="level" name="level" defaultValue={c.level as string}><option value="BEGINNER">Beginner</option><option value="INTERMEDIATE">Intermediate</option><option value="ADVANCED">Advanced</option></Select></Field>
            <Field label="Language" htmlFor="language"><Input id="language" name="language" defaultValue={c.language as string} /></Field>
            <Field label="Estimated hours" htmlFor="estimated_hours"><Input id="estimated_hours" name="estimated_hours" type="number" step="0.5" min="0" defaultValue={String(c.estimated_hours)} /></Field>
            <Field label="Capacity (blank = unlimited)" htmlFor="enrollment_capacity"><Input id="enrollment_capacity" name="enrollment_capacity" type="number" min="1" defaultValue={(c.enrollment_capacity as number) ?? ""} /></Field>
            <Field label="Access days (blank = lifetime)" htmlFor="access_days"><Input id="access_days" name="access_days" type="number" min="1" defaultValue={(c.access_days as number) ?? ""} /></Field>
            <Field label="Enrollment opens" htmlFor="enrollment_starts_at"><Input id="enrollment_starts_at" name="enrollment_starts_at" type="datetime-local" defaultValue={toLocal(c.enrollment_starts_at)} /></Field>
            <Field label="Enrollment closes" htmlFor="enrollment_ends_at"><Input id="enrollment_ends_at" name="enrollment_ends_at" type="datetime-local" defaultValue={toLocal(c.enrollment_ends_at)} /></Field>
            <Field label="Min. live attendance for certificate (%)" htmlFor="min_attendance_percent"><Input id="min_attendance_percent" name="min_attendance_percent" type="number" min="0" max="100" defaultValue={String(c.min_attendance_percent)} /></Field>
            <Field label="Thumbnail (PNG/JPG/WEBP, ≤5 MB)" htmlFor="thumbnail"><Input id="thumbnail" name="thumbnail" type="file" accept="image/png,image/jpeg,image/webp" /></Field>
            <div className="flex flex-wrap gap-5 md:col-span-2">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="enrollment_open" defaultChecked={c.enrollment_open as boolean} className="accent-[var(--brand)]" />Enrollment open</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="certificate_enabled" defaultChecked={c.certificate_enabled as boolean} className="accent-[var(--brand)]" />Issue certificates</label>
            </div>
            <div className="md:col-span-2"><SubmitButton pendingText="Saving…">{editable ? "Save details" : "Submit changes for approval"}</SubmitButton></div>
          </form>
        </Card>
      )}

      {tab === "curriculum" && (
        <div className="space-y-4">
          {data.modules.map((m, mi) => (
            <Card key={m.id as string} className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-semibold"><span className="mr-2 font-mono text-xs text-muted">M{mi + 1}</span>{m.title as string}</h2>
                {editable && <div className="flex gap-1">
                  <form action={B(A.moveNodeAction, id, "module", m.id, -1)}><button className={buttonClass("ghost", "sm")} aria-label="Move module up">↑</button></form>
                  <form action={B(A.moveNodeAction, id, "module", m.id, 1)}><button className={buttonClass("ghost", "sm")} aria-label="Move module down">↓</button></form>
                  <form action={B(A.deleteNodeAction, id, "module", m.id)}><ConfirmSubmit confirmText="Delete module and its lessons?">Delete</ConfirmSubmit></form>
                </div>}
              </div>
              <ul className="mt-3 space-y-2">
                {data.lessons.filter((l) => l.module_id === m.id).map((l) => (
                  <li key={l.id as string}>
                    <details className="rounded-xl border border-line">
                      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 text-sm">
                        <Badge>{String(l.kind).toLowerCase()}</Badge><span className="flex-1 font-medium">{l.title as string}</span>
                        {l.is_preview && <Badge tone="info">preview</Badge>}{l.video_asset_id ? <Badge tone="ok">video</Badge> : l.kind === "VIDEO" ? <Badge tone="warn">no video</Badge> : null}
                        <span className="text-xs text-muted">{formatDuration(l.duration_seconds as number)}</span>
                      </summary>
                      <form action={B(A.updateLessonAction, id, l.id)} className="grid gap-3 border-t border-line p-4 md:grid-cols-2" encType="multipart/form-data">
                        <Field label="Title" htmlFor={`lt-${l.id}`}><Input id={`lt-${l.id}`} name="title" defaultValue={l.title as string} /></Field>
                        <Field label="Type" htmlFor={`lk-${l.id}`}><Select id={`lk-${l.id}`} name="kind" defaultValue={l.kind as string}>{["VIDEO", "ARTICLE", "LIVE", "QUIZ", "ASSIGNMENT"].map((k) => <option key={k}>{k}</option>)}</Select></Field>
                        <Field label="Summary" htmlFor={`ls-${l.id}`} className="md:col-span-2"><Input id={`ls-${l.id}`} name="summary" defaultValue={l.summary as string} /></Field>
                        <Field label="Notes (markdown: ## heading, - list, **bold**)" htmlFor={`lb-${l.id}`} className="md:col-span-2"><Textarea id={`lb-${l.id}`} name="body" defaultValue={l.body as string} rows={5} /></Field>
                        <Field label="Video" htmlFor={`lv-${l.id}`}><Select id={`lv-${l.id}`} name="video_asset_id" defaultValue={(l.video_asset_id as string) ?? ""}><option value="">— none —</option>{data.assets.filter((a) => a.status === "READY").map((a) => <option key={a.id as string} value={a.id as string}>{(a.original_filename as string) ?? a.id} ({a.provider as string})</option>)}</Select></Field>
                        <Field label="Duration (seconds)" htmlFor={`ld-${l.id}`}><Input id={`ld-${l.id}`} name="duration_seconds" type="number" min="0" defaultValue={String(l.duration_seconds)} /></Field>
                        <Field label="Attach resource (PDF/PNG/JPG/ZIP)" htmlFor={`lr-${l.id}`}><Input id={`lr-${l.id}`} name="resource" type="file" accept=".pdf,.png,.jpg,.jpeg,.zip" /></Field>
                        <Field label="Resource title" htmlFor={`lrt-${l.id}`}><Input id={`lrt-${l.id}`} name="resourceTitle" placeholder="e.g. Lab sheet" /></Field>
                        <div className="flex gap-5 md:col-span-2 text-sm">
                          <label className="flex items-center gap-2"><input type="checkbox" name="is_preview" defaultChecked={l.is_preview as boolean} className="accent-[var(--brand)]" />Free preview</label>
                          <label className="flex items-center gap-2"><input type="checkbox" name="is_required" defaultChecked={l.is_required as boolean} className="accent-[var(--brand)]" />Required for completion</label>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 md:col-span-2">
                          <SubmitButton size="sm">{editable ? "Save lesson" : "Submit revision"}</SubmitButton>
                          {editable && <><button formAction={B(A.moveNodeAction, id, "lesson", l.id, -1)} className={buttonClass("ghost", "sm")}>Move up</button><button formAction={B(A.moveNodeAction, id, "lesson", l.id, 1)} className={buttonClass("ghost", "sm")}>Move down</button><button formAction={B(A.deleteNodeAction, id, "lesson", l.id)} className={buttonClass("ghost", "sm", "text-danger")}>Delete lesson</button></>}
                        </div>
                      </form>
                      {data.resources.filter((r) => r.lesson_id === l.id).length > 0 && (
                        <ul className="border-t border-line px-4 py-2 text-sm">
                          {data.resources.filter((r) => r.lesson_id === l.id).map((r) => <li key={r.id as string} className="flex items-center justify-between py-1"><span>📎 {r.title as string} <span className="text-xs text-muted">({Math.ceil((r.size_bytes as number) / 1024)} KB)</span></span><form action={B(A.deleteResourceAction, id, r.id)}><button className="text-xs text-danger">Remove</button></form></li>)}
                        </ul>
                      )}
                    </details>
                  </li>
                ))}
              </ul>
              {editable && (
                <form action={B(A.addLessonAction, id, m.id)} className="mt-3 flex flex-wrap gap-2">
                  <Input name="title" placeholder="New lesson title" className="max-w-sm" aria-label="New lesson title" required />
                  <Select name="kind" className="max-w-[150px]" aria-label="Lesson type"><option>VIDEO</option><option>ARTICLE</option><option>LIVE</option></Select>
                  <SubmitButton size="md" variant="outline">Add lesson</SubmitButton>
                </form>
              )}
            </Card>
          ))}
          {!data.modules.length && <EmptyState icon="layers" title="No modules yet" description="Start by adding a module, then lessons inside it." />}
          {editable && <Card className="p-5"><form action={B(A.addModuleAction, id)} className="flex flex-wrap gap-2"><Input name="title" placeholder="New module title" className="max-w-md" aria-label="New module title" required /><SubmitButton>Add module</SubmitButton></form></Card>}
        </div>
      )}

      {tab === "media" && (
        <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
          <Card className="p-5"><h2 className="mb-3 font-semibold">Upload a lesson video</h2><VideoUploader courseId={id} /></Card>
          <Card className="p-5">
            <h2 className="mb-3 font-semibold">Course videos</h2>
            {data.assets.length ? <ul className="divide-y divide-line text-sm">{data.assets.map((a) => (
              <li key={a.id as string} className="flex items-center justify-between gap-3 py-2.5"><span className="truncate">{(a.original_filename as string) ?? a.id}<span className="block text-xs text-muted">{a.provider as string} · {formatDuration((a.duration_seconds as number) ?? 0)} · {formatDateTime(a.created_at as string)}</span></span><StatusBadge status={a.status as string} /></li>
            ))}</ul> : <EmptyState icon="film" title="No videos yet" />}
          </Card>
        </div>
      )}

      {tab === "assessments" && (
        <div className="space-y-5">
          {data.quizzes.map((q) => (
            <Card key={q.id as string} className="p-5">
              <h2 className="font-semibold">{q.title as string} <span className="text-xs font-normal text-muted">pass {q.pass_percent as number}% · {q.max_attempts ? `${q.max_attempts} attempts` : "unlimited attempts"} · {q.is_required ? "required" : "optional"}</span></h2>
              <ol className="mt-3 space-y-2 text-sm">
                {data.questions.filter((x) => x.quiz_id === q.id).map((x, i) => (
                  <li key={x.id as string} className="rounded-xl border border-line p-3">
                    <div className="flex justify-between gap-3"><p className="font-medium">{i + 1}. {x.prompt as string}</p><form action={B(A.deleteQuestionAction, id, x.id)}><button className="text-xs text-danger">Delete</button></form></div>
                    <ul className="mt-1.5 grid gap-1 sm:grid-cols-2">{(x.options as string[]).map((o, oi) => <li key={oi} className={oi === x.correct_index ? "font-semibold text-ok" : "text-muted"}>{oi === x.correct_index ? "✓ " : "· "}{o}</li>)}</ul>
                  </li>
                ))}
              </ol>
              <details className="mt-3"><summary className="cursor-pointer text-sm font-semibold text-brand-strong">+ Add question</summary>
                <form action={B(A.addQuestionAction, id, q.id)} className="mt-3 grid gap-3">
                  <Field label="Question" htmlFor={`qp-${q.id}`}><Input id={`qp-${q.id}`} name="prompt" required /></Field>
                  <Field label="Options (one per line, 2–8)" htmlFor={`qo-${q.id}`}><Textarea id={`qo-${q.id}`} name="options" rows={4} required /></Field>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Correct option number (1 = first)" htmlFor={`qc-${q.id}`}><Input id={`qc-${q.id}`} name="correctIndexHuman" type="number" min="1" max="8" defaultValue="1" /></Field>
                    <Field label="Explanation (shown after passing)" htmlFor={`qe-${q.id}`}><Input id={`qe-${q.id}`} name="explanation" /></Field>
                  </div>
                                    <div><SubmitButton size="sm">Add question</SubmitButton></div>
                </form>
              </details>
            </Card>
          ))}
          <div className="grid gap-5 md:grid-cols-2">
            <Card className="p-5"><h2 className="mb-3 font-semibold">New quiz</h2>
              <form action={B(A.createQuizAction, id)} className="grid gap-3">
                <Field label="Title" htmlFor="qt"><Input id="qt" name="title" required /></Field>
                <div className="grid grid-cols-2 gap-3"><Field label="Pass %" htmlFor="qpp"><Input id="qpp" name="passPercent" type="number" min="1" max="100" defaultValue="60" /></Field><Field label="Max attempts" htmlFor="qma"><Input id="qma" name="maxAttempts" type="number" min="1" placeholder="∞" /></Field></div>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isRequired" defaultChecked className="accent-[var(--brand)]" />Required for certificate</label>
                <div><SubmitButton size="sm">Create quiz</SubmitButton></div>
              </form>
            </Card>
            <Card className="p-5"><h2 className="mb-3 font-semibold">Assignments</h2>
              <ul className="mb-4 space-y-1 text-sm">{data.assignments.map((a) => <li key={a.id as string}>• {a.title as string} <span className="text-xs text-muted">{a.max_points as number} pts · pass {a.pass_points as number}{a.is_required ? " · required" : ""}</span></li>)}</ul>
              <form action={B(A.createAssignmentAction, id)} className="grid gap-3">
                <Field label="Title" htmlFor="at"><Input id="at" name="title" required /></Field>
                <Field label="Instructions" htmlFor="ai"><Textarea id="ai" name="instructions" rows={3} /></Field>
                <div className="grid grid-cols-3 gap-3"><Field label="Max pts" htmlFor="am"><Input id="am" name="maxPoints" type="number" defaultValue="100" /></Field><Field label="Pass pts" htmlFor="ap"><Input id="ap" name="passPoints" type="number" defaultValue="50" /></Field><Field label="Due" htmlFor="ad"><Input id="ad" name="dueAt" type="datetime-local" /></Field></div>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isRequired" className="accent-[var(--brand)]" />Required for certificate</label>
                <div><SubmitButton size="sm">Create assignment</SubmitButton></div>
              </form>
            </Card>
          </div>
        </div>
      )}

      {tab === "pricing" && (
        <Card className="max-w-xl p-6">
          {sa ? (
            <form action={B(A.pricingAction, id)} className="grid gap-4">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isFree" defaultChecked={c.is_free as boolean} className="accent-[var(--brand)]" />Free course</label>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Price (₹)" htmlFor="price"><Input id="price" name="price" type="number" min="0" step="1" defaultValue={String((c.price_paise as number) / 100)} /></Field>
                <Field label="Compare-at price (₹, optional)" htmlFor="compareAt"><Input id="compareAt" name="compareAt" type="number" min="0" step="1" defaultValue={c.compare_at_price_paise ? String((c.compare_at_price_paise as number) / 100) : ""} /></Field>
              </div>
              <div><SubmitButton>Save pricing</SubmitButton></div>
            </form>
          ) : (
            <div><p className="text-sm text-muted">Current price</p><p className="font-display text-2xl font-semibold">{c.is_free ? "Free" : formatMoney(c.price_paise as number)}</p><p className="mt-3 text-sm text-muted">Pricing is managed by a Super Admin.</p></div>
          )}
        </Card>
      )}

      {tab === "team" && sa && (
        <Card className="p-5">
          <h2 className="mb-3 font-semibold">Assigned Content Managers</h2>
          {data.managers.length ? <ul className="divide-y divide-line">{data.managers.map((m) => (
            <li key={m.id as string} className="flex items-center justify-between py-2.5 text-sm"><span>{m.full_name as string} <span className="text-muted">{m.email as string}</span></span>
              <form action={B(A.assignManagerAction, id)}><input type="hidden" name="userId" value={m.id as string} /><input type="hidden" name="assign" value={m.assigned ? "0" : "1"} /><SubmitButton size="sm" variant={m.assigned ? "outline" : "primary"}>{m.assigned ? "Unassign" : "Assign"}</SubmitButton></form></li>
          ))}</ul> : <EmptyState icon="users" title="No Content Managers yet" action={<Link className={buttonClass("outline", "sm")} href="/admin/team">Add one</Link>} />}
        </Card>
      )}

      {tab === "history" && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card className="p-5"><h2 className="mb-3 font-semibold">Approval requests</h2>
            {data.history.length ? <ul className="space-y-3 text-sm">{data.history.map((h) => (
              <li key={h.id as string} className="rounded-xl border border-line p-3"><div className="flex justify-between"><span className="font-medium">{String(h.kind).replace("_", " ").toLowerCase()}</span><StatusBadge status={h.status as string} /></div>
                <p className="text-xs text-muted">by {(h.requester as string) ?? "—"} · {formatDateTime(h.created_at as string)}</p>{h.note && <p className="mt-1">“{h.note as string}”</p>}
                {h.decision_comment && <p className="mt-1 text-fg-2">↳ {(h.decider as string) ?? "Reviewer"}: {h.decision_comment as string}</p>}</li>
            ))}</ul> : <EmptyState title="No reviews yet" />}
          </Card>
          <Card className="p-5"><h2 className="mb-3 font-semibold">Content revisions</h2>
            {data.revisions.length ? <ul className="space-y-3 text-sm">{data.revisions.map((r) => (
              <li key={r.id as string} className="rounded-xl border border-line p-3"><div className="flex justify-between"><span>{r.entity_type as string}: {Object.keys(r.payload as object).join(", ")}</span><StatusBadge status={r.status as string} /></div>
                <p className="text-xs text-muted">{formatDateTime(r.created_at as string)}{r.reviewer_comment ? ` · “${r.reviewer_comment}”` : ""}</p></li>
            ))}</ul> : <EmptyState title="No revisions" />}
          </Card>
        </div>
      )}

      {tab === "analytics" && analytics && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card className="p-5"><h2 className="font-semibold">Summary</h2><dl className="mt-3 grid grid-cols-3 gap-3 text-center"><div><dt className="text-xs text-muted">Enrolled</dt><dd className="font-display text-2xl">{analytics.summary.enrolled as number}</dd></div><div><dt className="text-xs text-muted">Completed</dt><dd className="font-display text-2xl">{analytics.summary.completed as number}</dd></div><div><dt className="text-xs text-muted">Avg progress</dt><dd className="font-display text-2xl">{Math.round(analytics.summary.avg_progress as number)}%</dd></div></dl>
            <h3 className="mb-2 mt-6 text-sm font-semibold">Quiz performance</h3>
            <ul className="space-y-1 text-sm">{analytics.quizzes.map((q, i) => <li key={i} className="flex justify-between"><span>{q.title as string}</span><span className="text-muted">{q.attempts as number} attempts · avg {Math.round(q.avg_percent as number)}% · {q.passed as number} passed</span></li>)}</ul>
          </Card>
          <Card className="p-5"><h2 className="mb-3 font-semibold">Lesson completions</h2><BarChart label="Lesson completions" data={analytics.lessons.map((l) => ({ label: String(l.title).slice(0, 10), value: l.completions as number }))} /></Card>
        </div>
      )}
    </div>
  );
}
