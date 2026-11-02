import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { dashboardData } from "@/lib/services/student";
import { Lab3D } from "@/components/student/Lab3D";
import { Alert, Badge, Card, EmptyState, ProgressBar, StatCard, buttonClass } from "@/components/ui/primitives";
import { Sparkbars } from "@/components/ui/charts";
import { Icon } from "@/components/ui/Icon";
import { formatDateTime, formatMoney, relativeTime } from "@/lib/format";
import { CategoryGlyph } from "@/components/public/CategoryGlyph";

export const metadata: Metadata = { title: "My lab" };

export default async function DashboardHome({ searchParams }: { searchParams: Promise<{ welcome?: string; denied?: string }> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const d = await dashboardData(user);
  const first = user.fullName.split(" ")[0];
  const nextClass = d.live[0] ? `${String(d.live[0].title).slice(0, 18)} · ${formatDateTime(d.live[0].starts_at as string)}` : "No class scheduled";

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {sp.welcome && <Alert tone="ok" title={`Welcome to Tierra Academy, ${first}!`}>Your lab is ready. Start with a free course or explore the catalogue.</Alert>}
      {sp.denied && <Alert tone="warn">That area is only available to academy staff.</Alert>}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="label-mono mb-1">Student lab</p>
          <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">Hello, {first} 👋</h1>
          <p className="mt-1 text-sm text-muted">{d.courses.length ? `You're enrolled in ${d.courses.length} course${d.courses.length > 1 ? "s" : ""}.` : "Enroll in your first course to start building."}</p>
        </div>
        {d.continueLesson && (
          <Link href={`/dashboard/learn/${d.continueLesson.slug}${d.continueLesson.lessonId ? `/${d.continueLesson.lessonId}` : ""}`} className={buttonClass("primary", "md")}>
            <Icon name="play" size={14} />Continue: {d.continueLesson.title.slice(0, 32)}{d.continueLesson.title.length > 32 ? "…" : ""}
          </Link>
        )}
      </div>

      <Lab3D courses={d.courses.map((c) => c.title as string)} nextClass={nextClass} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Enrolled courses" value={d.courses.length} icon="book" />
        <StatCard label="Lessons completed" value={d.stats.lessons_done as number} icon="check" hint={<Sparkbars values={d.weekly.map((w) => w.n as number)} />} />
        <StatCard label="Live classes attended" value={d.stats.classes_attended as number} icon="video" accent="#38d2ff" />
        <StatCard label="Certificates" value={d.stats.certificates as number} icon="award" accent="#ffd60a" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between"><h2 className="font-display text-lg font-semibold">Continue learning</h2><Link href="/dashboard/courses" className="text-sm text-brand-strong">All courses →</Link></div>
          {d.courses.length ? (
            <ul className="space-y-3">
              {d.courses.slice(0, 4).map((c) => (
                <li key={c.id as string}>
                  <Link href={`/dashboard/learn/${c.slug}`} className="flex items-center gap-4 rounded-xl p-2 transition hover:bg-surface-2">
                    <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-navy-900"><CategoryGlyph slug={c.category_slug as string} color={c.accent as string} className="size-8" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{c.title as string}</span>
                      <span className="mt-1.5 flex items-center gap-3"><span className="flex-1"><ProgressBar value={c.progress as number} label={`${c.title} progress`} /></span><span className="text-xs text-muted">{Math.round(c.progress as number)}%</span></span>
                    </span>
                    {c.status === "COMPLETED" && <Badge tone="brand">Done</Badge>}
                  </Link>
                </li>
              ))}
            </ul>
          ) : <EmptyState icon="book" title="No courses yet" description="Free courses unlock instantly." action={<Link href="/courses?price=free" className={buttonClass("primary", "sm")}>Find a free course</Link>} />}
        </Card>

        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between"><h2 className="font-display text-lg font-semibold">Upcoming classes</h2><Link href="/dashboard/live" className="text-sm text-brand-strong">Schedule →</Link></div>
          {d.live.length ? (
            <ul className="space-y-3">
              {d.live.map((s) => (
                <li key={s.id as string} className="flex items-center gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-info"><Icon name="video" size={18} /></span>
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{s.title as string}</p><p className="text-xs text-muted">{formatDateTime(s.starts_at as string)} · {relativeTime(s.starts_at as string)}</p></div>
                  <Link href={`/dashboard/live/${s.id}`} className={buttonClass(s.status === "LIVE" ? "primary" : "outline", "sm")}>{s.status === "LIVE" ? "Join" : "Open"}</Link>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted">No upcoming live classes in your courses.</p>}
        </Card>
      </div>

      {d.recs.length > 0 && (
        <section aria-labelledby="recs">
          <h2 id="recs" className="mb-3 font-display text-lg font-semibold">Recommended for you</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {d.recs.map((c) => (
              <Link key={c.id as string} href={`/courses/${c.slug}`} className="glass group flex gap-4 rounded-2xl p-4 transition hover:-translate-y-0.5">
                <CategoryGlyph slug={c.category_slug as string} color={c.accent as string} className="size-12 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs" style={{ color: c.accent as string }}>{c.category_name as string}</p>
                  <p className="line-clamp-2 text-sm font-semibold group-hover:text-brand-strong">{c.title as string}</p>
                  <p className="mt-1 text-xs font-semibold">{c.is_free ? <span className="text-ok">Free</span> : formatMoney(c.price_paise as number, c.currency as string)}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
