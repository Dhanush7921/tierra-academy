import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { dashboardData } from "@/lib/services/student";
import { Alert, Card, EmptyState, PageHeader, ProgressBar, StatusBadge, buttonClass } from "@/components/ui/primitives";
import { CourseThumb } from "@/components/public/CourseCard";

export const metadata: Metadata = { title: "My courses" };

export default async function MyCourses({ searchParams }: { searchParams: Promise<{ enrolled?: string }> }) {
  const { enrolled } = await searchParams;
  const user = await requireUser();
  const { courses } = await dashboardData(user);
  return (
    <div className="mx-auto max-w-6xl">
      {enrolled && <div className="mb-5"><Alert tone="ok" title="You're in!">Your course is unlocked and ready below.</Alert></div>}
      <PageHeader eyebrow="Learning" title="My courses" actions={<Link href="/courses" className={buttonClass("outline", "sm")}>Find more courses</Link>} />
      {courses.length ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((c) => (
            <Card key={c.id as string} className="flex flex-col p-3">
              <CourseThumb title={c.title as string} categorySlug={c.category_slug as string} accent={c.accent as string} src={c.thumbnail_url as string | null} />
              <div className="flex flex-1 flex-col p-2 pt-4">
                <div className="mb-2 flex items-center justify-between"><span className="text-xs" style={{ color: c.accent as string }}>{c.category_name as string}</span><StatusBadge status={c.status as string} /></div>
                <h2 className="font-semibold">{c.title as string}</h2>
                <div className="mt-auto pt-4"><ProgressBar value={c.progress as number} label={`${c.title} progress`} /><p className="mt-1.5 text-xs text-muted">{Math.round(c.progress as number)}% complete</p></div>
                <Link href={`/dashboard/learn/${c.slug}`} className={buttonClass("primary", "sm", "mt-4")}>{(c.progress as number) > 0 ? "Continue" : "Start"}</Link>
              </div>
            </Card>
          ))}
        </div>
      ) : <EmptyState icon="book" title="You haven't enrolled yet" description="Pick a free course to begin, or explore paid programs." action={<Link className={buttonClass("primary", "sm")} href="/courses">Browse courses</Link>} />}
    </div>
  );
}
