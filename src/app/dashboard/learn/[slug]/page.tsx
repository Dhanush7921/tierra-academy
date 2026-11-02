import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { learnData } from "@/lib/services/student";

/** Resumes the course at the last-watched (or first unfinished) lesson. */
export default async function CourseLearnPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await requireUser();
  const d = await learnData(user, slug);
  if (!d) notFound();
  if (!d.course.enrolled && !d.course.staff) redirect(`/courses/${slug}`);
  if (!d.current) redirect(`/courses/${slug}`);
  redirect(`/dashboard/learn/${slug}/${d.current.id}`);
}
