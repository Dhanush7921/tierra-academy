import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getCourseBySlug } from "@/lib/services/catalog";
import { enrollFreeAction } from "@/app/actions/public";
import { checkoutReadiness } from "@/lib/services/price-options";
import { CourseThumb } from "@/components/public/CourseCard";
import { Alert, Badge, Card, ProgressBar, buttonClass } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/client";
import { Icon } from "@/components/ui/Icon";
import { formatDateTime, formatDuration, formatMoney } from "@/lib/format";

type P = { params: Promise<{ slug: string }>; searchParams: Promise<{ error?: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { slug } = await params;
  const d = await getCourseBySlug(slug, null);
  return d ? { title: d.course.title as string, description: d.course.subtitle as string } : { title: "Course not found" };
}

const DELIVERY: Record<string, string> = { RECORDED: "Recorded course", LIVE: "Live classes", HYBRID: "Live + recorded" };

export default async function CoursePage({ params, searchParams }: P) {
  const { slug } = await params;
  const { error } = await searchParams;
  const user = await getSession();
  const data = await getCourseBySlug(slug, user);
  if (!data) notFound();
  const { course: c, outline, sessions, enrollment, options } = data;
  const readiness = await checkoutReadiness();
  const modules = new Map<string, { title: string; lessons: typeof outline }>();
  for (const row of outline) {
    const m = modules.get(row.module_id as string) ?? { title: row.module_title as string, lessons: [] as unknown as typeof outline };
    if (row.lesson_id) (m.lessons as unknown as Record<string, unknown>[]).push(row);
    modules.set(row.module_id as string, m);
  }
  const lessonCount = outline.filter((o) => o.lesson_id).length;
  const totalSecs = outline.reduce((s, o) => s + ((o.duration_seconds as number) || 0), 0);
  const enrolled = enrollment && ["ACTIVE", "COMPLETED"].includes(enrollment.status as string);
  const isPublished = c.status === "PUBLISHED";
  const enroll = enrollFreeAction.bind(null, c.id as string, c.slug as string);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <nav aria-label="Breadcrumb" className="mb-6 text-sm text-muted">
        <Link href="/courses" className="hover:text-fg">Courses</Link> <span aria-hidden="true">/</span>{" "}
        <Link href={`/courses?category=${c.category_slug}`} className="hover:text-fg">{c.category_name as string}</Link>
      </nav>
      {error && <div className="mb-6"><Alert tone="danger">{error}</Alert></div>}
      {!isPublished && <div className="mb-6"><Alert tone="warn" title="Preview">This course is <b>{String(c.status).toLowerCase()}</b> and only visible to staff.</Alert></div>}
      <div className="grid gap-10 lg:grid-cols-[1fr_380px]">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="brand">{c.category_name as string}</Badge>
            <Badge>{DELIVERY[c.delivery as string]}</Badge>
            <Badge>{String(c.level).toLowerCase()}</Badge>
            {c.is_demo && <Badge tone="warn">Demo content</Badge>}
          </div>
          <h1 className="mt-4 font-display text-3xl font-semibold tracking-tight sm:text-4xl">{c.title as string}</h1>
          <p className="mt-3 text-lg text-fg-2">{c.subtitle as string}</p>
          <div className="mt-5 flex flex-wrap gap-5 text-sm text-muted">
            <span className="flex items-center gap-1.5"><Icon name="book" size={16} />{lessonCount} lessons</span>
            <span className="flex items-center gap-1.5"><Icon name="clock" size={16} />{c.estimated_hours as number} hours{totalSecs ? ` · ${formatDuration(totalSecs)} of video` : ""}</span>
            <span className="flex items-center gap-1.5"><Icon name="award" size={16} />{c.certificate_enabled ? "Certificate on completion" : "No certificate"}</span>
            <span className="flex items-center gap-1.5"><Icon name="info" size={16} />{c.language as string}</span>
          </div>

          <section className="mt-10" aria-labelledby="about">
            <h2 id="about" className="font-display text-xl font-semibold">About this course</h2>
            <div className="mt-3 space-y-3 whitespace-pre-line text-fg-2">{c.description as string}</div>
          </section>

          {(c.outcomes as string[]).length > 0 && (
            <section className="mt-10" aria-labelledby="outcomes">
              <h2 id="outcomes" className="font-display text-xl font-semibold">What you will learn</h2>
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                {(c.outcomes as string[]).map((o) => <li key={o} className="flex gap-2.5 text-sm"><Icon name="check" size={18} className="shrink-0 text-ok" />{o}</li>)}
              </ul>
            </section>
          )}

          <section className="mt-10" aria-labelledby="curriculum">
            <h2 id="curriculum" className="font-display text-xl font-semibold">Curriculum</h2>
            <div className="mt-4 space-y-3">
              {[...modules.values()].map((m, mi) => (
                <details key={mi} open={mi === 0} className="glass group rounded-2xl">
                  <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4">
                    <span className="font-semibold"><span className="mr-2 font-mono text-xs text-muted">M{mi + 1}</span>{m.title}</span>
                    <span className="flex items-center gap-2 text-xs text-muted">{m.lessons.length} lessons <Icon name="down" size={14} className="transition group-open:rotate-180" /></span>
                  </summary>
                  <ul className="border-t border-line px-5 py-2">
                    {(m.lessons as unknown as Record<string, unknown>[]).map((l) => (
                      <li key={l.lesson_id as string} className="flex items-center justify-between gap-4 py-2.5 text-sm">
                        <span className="flex items-center gap-2.5"><Icon name={l.lesson_kind === "LIVE" ? "video" : l.lesson_kind === "ARTICLE" ? "file" : "play"} size={15} className="text-muted" />{l.lesson_title as string}</span>
                        <span className="flex items-center gap-2 text-xs text-muted">{l.is_preview ? <Badge tone="info">Preview</Badge> : !enrolled && <Icon name="lock" size={13} />}{formatDuration(l.duration_seconds as number)}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              ))}
            </div>
          </section>

          {(c.requirements as string[]).length > 0 && (
            <section className="mt-10" aria-labelledby="reqs">
              <h2 id="reqs" className="font-display text-xl font-semibold">Requirements</h2>
              <ul className="mt-3 list-disc space-y-1.5 pl-5 text-fg-2">{(c.requirements as string[]).map((r) => <li key={r}>{r}</li>)}</ul>
            </section>
          )}

          {c.instructor_name && (
            <section className="mt-10" aria-labelledby="instructor">
              <h2 id="instructor" className="font-display text-xl font-semibold">Instructor</h2>
              <Card className="mt-4 flex gap-4 p-5">
                <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-surface-2 text-brand"><Icon name="user" size={24} /></span>
                <div>
                  <p className="font-semibold">{c.instructor_name as string} {c.instructor_is_demo && <Badge tone="warn">Demo profile</Badge>}</p>
                  <p className="text-sm text-muted">{c.instructor_headline as string}</p>
                  <p className="mt-2 text-sm text-fg-2">{c.instructor_bio as string}</p>
                </div>
              </Card>
            </section>
          )}
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <Card strong className="overflow-hidden p-3">
            <CourseThumb title={c.title as string} categorySlug={c.category_slug as string} accent={c.accent as string} src={c.thumbnail_url as string | null} />
            <div className="p-3">
              <div className="flex items-baseline gap-2">
                <span className="font-display text-3xl font-semibold">{c.is_free ? "Free" : `${options.length > 1 ? "From " : ""}${formatMoney(c.price_paise as number, c.currency as string)}`}</span>
                {!c.is_free && <span className="text-sm text-muted">+ applicable tax</span>}
                {!c.is_free && c.compare_at_price_paise && <span className="text-muted line-through">{formatMoney(c.compare_at_price_paise as number)}</span>}
              </div>
              {!c.is_free && options.length > 0 && (
                <ul className="mt-4 divide-y divide-line rounded-xl border border-line text-sm">
                  {options.map((o) => (
                    <li key={o.id as string} className="flex items-center justify-between px-3 py-2">
                      <span>{o.label as string}{o.duration_days ? <span className="text-muted"> · {o.duration_days as number} days</span> : null}</span>
                      <span className="font-semibold tabular-nums">{formatMoney(o.price_paise as number)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {enrolled ? (
                <div className="mt-4 space-y-3">
                  <ProgressBar value={Number(enrollment!.progress)} label="Course progress" />
                  <p className="text-sm text-muted">{Math.round(Number(enrollment!.progress))}% complete</p>
                  <Link href={`/dashboard/learn/${c.slug}`} className={buttonClass("primary", "lg", "w-full")}>Continue learning</Link>
                </div>
              ) : !isPublished ? (
                <p className="mt-4 text-sm text-muted">Enrollment opens when the course is published.</p>
              ) : !c.enrollment_open ? (
                <p className="mt-4 text-sm text-muted">Enrollment is currently closed.</p>
              ) : c.is_free ? (
                <form action={enroll} className="mt-4"><SubmitButton size="lg" className="w-full" pendingText="Enrolling…">{user ? "Enroll for free" : "Sign in to enroll free"}</SubmitButton></form>
              ) : (
                readiness.ready ? (
                  <Link href={user ? `/checkout/${c.slug}` : `/login?next=/checkout/${c.slug}`} className={buttonClass("primary", "lg", "mt-4 w-full")}>Choose duration &amp; enroll</Link>
                ) : (
                  <p className="mt-4 rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-sm text-fg-2">Enrollment opens soon. <Link href="/contact" className="underline">Contact us</Link> to register your interest.</p>
                )
              )}
              <ul className="mt-5 space-y-2 text-sm text-fg-2">
                {c.access_days ? <li className="flex gap-2"><Icon name="unlock" size={16} className="text-muted" />{`${c.access_days} days of access`}</li> : null}
                {c.certificate_enabled ? <li className="flex gap-2"><Icon name="award" size={16} className="text-muted" />Tierra Automation completion certificate</li> : null}
                {!c.is_free && <li className="flex gap-2"><Icon name="shield" size={16} className="text-muted" />Secure checkout · <Link href="/refund-policy" className="underline">refund policy</Link></li>}
              </ul>
            </div>
          </Card>
          {sessions.length > 0 && (
            <Card className="mt-4 p-5">
              <p className="label-mono mb-3">Upcoming live sessions</p>
              <ul className="space-y-3">
                {sessions.map((s) => (
                  <li key={s.id as string} className="text-sm">
                    <p className="font-medium">{s.title as string}</p>
                    <p className="text-muted">{formatDateTime(s.starts_at as string)} · {s.duration_minutes as number} min</p>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}
