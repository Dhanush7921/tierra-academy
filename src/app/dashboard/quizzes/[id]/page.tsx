import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { getQuizForStudent } from "@/lib/services/learning";
import { QuizRunner } from "@/components/student/QuizRunner";
import { Card, PageHeader } from "@/components/ui/primitives";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Quiz" };

export default async function QuizPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const q = await getQuizForStudent(user, id);
  if (!q) notFound();
  const used = q.attempts.filter((a) => a.submitted_at).length;
  const left = q.quiz.max_attempts ? (q.quiz.max_attempts as number) - used : null;
  const best = Math.max(0, ...q.attempts.map((a) => Number(a.percent)));
  return (
    <div className="mx-auto max-w-3xl">
      <Link href={`/dashboard/learn/${q.quiz.course_slug}`} className="text-sm text-muted hover:text-fg">← {q.quiz.course_title as string}</Link>
      <PageHeader eyebrow="Knowledge check" title={q.quiz.title as string} description={`${q.questions.length} questions · pass mark ${q.quiz.pass_percent}%${left !== null ? ` · ${left} attempt${left === 1 ? "" : "s"} left` : ""}${used ? ` · best ${Math.round(best)}%` : ""}`} />
      <QuizRunner quizId={id} questions={q.questions} disabled={left !== null && left <= 0} />
      {q.attempts.length > 0 && (
        <Card className="mt-6 p-5">
          <h2 className="mb-2 font-semibold">Previous attempts</h2>
          <ul className="space-y-1 text-sm">{q.attempts.map((a) => <li key={a.id as string} className="flex justify-between"><span>{formatDateTime(a.submitted_at as string)}</span><span className={a.passed ? "text-ok" : "text-muted"}>{Math.round(Number(a.percent))}% {a.passed ? "· passed" : ""}</span></li>)}</ul>
        </Card>
      )}
    </div>
  );
}
