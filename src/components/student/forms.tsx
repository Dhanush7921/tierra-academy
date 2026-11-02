"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { changePasswordAction, requestRefundAction, submitAssignmentAction, submitQuizAction, updateProfileAction } from "@/app/actions/student";
import { Alert, Card, Field, Input, Textarea, buttonClass, cx } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/client";
import type { FormState } from "@/lib/validation";

type Q = { id: string; prompt: string; options: string[]; points: number };
type Result = Awaited<ReturnType<typeof submitQuizAction>>;

export function QuizRunner({ quizId, questions, disabled }: { quizId: string; questions: Q[]; disabled?: boolean }) {
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [result, setResult] = useState<Result | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const complete = questions.every((q) => answers[q.id] !== undefined);
  const review = result?.ok ? new Map(result.review.map((r) => [r.id, r])) : null;
  const submit = () => start(async () => { const r = await submitQuizAction(quizId, answers); setResult(r); router.refresh(); });

  return (
    <div className="space-y-4">
      {result?.ok && (
        <Alert tone={result.passed ? "ok" : "warn"} title={result.passed ? `Passed — ${Math.round(result.percent)}%` : `Not passed — ${Math.round(result.percent)}%`}>
          You scored {result.score}/{result.max}. Pass mark is {result.passPercent}%. {result.passed ? "Great work!" : "Review the lesson and try again — correct answers are revealed once you pass."}
        </Alert>
      )}
      {result && !result.ok && <Alert tone="danger">{result.error}</Alert>}
      {questions.map((q, qi) => {
        const r = review?.get(q.id);
        return (
          <Card key={q.id} className="p-5">
            <fieldset disabled={disabled || pending}>
              <legend className="font-semibold"><span className="mr-2 font-mono text-xs text-muted">Q{qi + 1}</span>{q.prompt}</legend>
              <div className="mt-3 grid gap-2">
                {q.options.map((o, oi) => {
                  const chosen = answers[q.id] === oi;
                  const isCorrect = r?.correctIndex === oi;
                  return (
                    <label key={oi} className={cx("flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm transition",
                      isCorrect ? "border-ok bg-[color-mix(in_srgb,var(--ok)_12%,transparent)]" : chosen ? "border-brand bg-[color-mix(in_srgb,var(--brand)_10%,transparent)]" : "border-line-strong hover:border-brand")}>
                      <input type="radio" name={q.id} checked={chosen} onChange={() => { setAnswers((a) => ({ ...a, [q.id]: oi })); setResult(null); }} className="accent-[var(--brand)]" />
                      {o}
                    </label>
                  );
                })}
              </div>
              {r && <p className={cx("mt-2 text-xs", r.correct ? "text-ok" : "text-danger")}>{r.correct ? "Correct" : "Incorrect"}{r.explanation ? ` — ${r.explanation}` : ""}</p>}
            </fieldset>
          </Card>
        );
      })}
      <button className={buttonClass("primary", "lg")} disabled={!complete || pending || disabled} onClick={submit}>{pending ? "Grading…" : disabled ? "No attempts left" : "Submit answers"}</button>
    </div>
  );
}

export function AssignmentForm({ a }: { a: { id: string; allowText: boolean; allowLink: boolean; allowFile: boolean; maxFileMb: number; text: string; link: string; hasFile: boolean } }) {
  const [s, action] = useActionState<FormState, FormData>(submitAssignmentAction, undefined);
  return (
    <form action={action} className="mt-4 space-y-3" encType="multipart/form-data">
      <input type="hidden" name="assignmentId" value={a.id} />
      {a.allowText && <Field label="Your answer" htmlFor={`t-${a.id}`}><Textarea id={`t-${a.id}`} name="text" defaultValue={a.text} rows={4} /></Field>}
      {a.allowLink && <Field label="Link (GitHub, drive, video…)" htmlFor={`l-${a.id}`} error={s?.errors?.link}><Input id={`l-${a.id}`} name="link" type="url" defaultValue={a.link} placeholder="https://" /></Field>}
      {a.allowFile && <Field label={`File (PDF, PNG, JPG or ZIP · max ${a.maxFileMb} MB)`} htmlFor={`f-${a.id}`} hint={a.hasFile ? "A file is already attached; uploading replaces it." : undefined} error={s?.errors?.file}><Input id={`f-${a.id}`} name="file" type="file" accept=".pdf,.png,.jpg,.jpeg,.zip" /></Field>}
      {s?.message && <Alert tone={s.ok ? "ok" : "danger"}>{s.message}</Alert>}
      <SubmitButton size="sm" pendingText="Submitting…">{a.text || a.link || a.hasFile ? "Update submission" : "Submit"}</SubmitButton>
    </form>
  );
}

export function RefundRequest({ orderId }: { orderId: string }) {
  const [open, setOpen] = useState(false);
  const [s, action] = useActionState<FormState, FormData>(requestRefundAction, undefined);
  if (s?.ok) return <span className="text-xs text-ok">{s.message}</span>;
  if (!open) return <button className={buttonClass("ghost", "sm")} onClick={() => setOpen(true)}>Request refund</button>;
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="orderId" value={orderId} />
      <label htmlFor={`r-${orderId}`} className="sr-only">Reason</label>
      <Input id={`r-${orderId}`} name="reason" placeholder="Reason (optional)" className="h-8 text-xs" />
      <div className="flex gap-1"><SubmitButton size="sm" variant="outline">Send</SubmitButton><button type="button" className={buttonClass("ghost", "sm")} onClick={() => setOpen(false)}>Cancel</button></div>
      {s?.message && <span className="text-xs text-danger">{s.message}</span>}
    </form>
  );
}

export function ProfileForms({ profile, localAuth }: { profile: { fullName: string; phone: string; city: string; bio: string; notifyEmail: boolean; notifyLive: boolean }; localAuth: boolean }) {
  const [s, action] = useActionState<FormState, FormData>(updateProfileAction, undefined);
  const [ps, pwAction] = useActionState<FormState, FormData>(changePasswordAction, undefined);
  return (
    <>
      <Card className="p-6">
        <h2 className="mb-4 font-semibold">Profile</h2>
        <form action={action} className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name (shown on certificates)" htmlFor="fullName" error={s?.errors?.fullName} className="sm:col-span-2"><Input id="fullName" name="fullName" defaultValue={profile.fullName} required /></Field>
          <Field label="Phone" htmlFor="phone" error={s?.errors?.phone}><Input id="phone" name="phone" defaultValue={profile.phone} inputMode="tel" /></Field>
          <Field label="City" htmlFor="city"><Input id="city" name="city" defaultValue={profile.city} /></Field>
          <Field label="About you" htmlFor="bio" className="sm:col-span-2"><Textarea id="bio" name="bio" defaultValue={profile.bio} rows={3} /></Field>
          <fieldset className="space-y-2 sm:col-span-2"><legend className="mb-1 text-sm font-medium text-fg-2">Notifications</legend>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="notifyEmail" defaultChecked={profile.notifyEmail} className="accent-[var(--brand)]" />Email me about payments, certificates and grading</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="notifyLive" defaultChecked={profile.notifyLive} className="accent-[var(--brand)]" />Live class reminders</label>
          </fieldset>
          {s?.message && <div className="sm:col-span-2"><Alert tone={s.ok ? "ok" : "danger"}>{s.message}</Alert></div>}
          <div><SubmitButton pendingText="Saving…">Save profile</SubmitButton></div>
        </form>
      </Card>
      {localAuth && (
        <Card className="p-6">
          <h2 className="mb-4 font-semibold">Change password</h2>
          <form action={pwAction} className="grid gap-4 sm:grid-cols-2">
            <Field label="Current password" htmlFor="current"><Input id="current" name="current" type="password" autoComplete="current-password" required /></Field>
            <Field label="New password" htmlFor="next" error={ps?.errors?.next}><Input id="next" name="next" type="password" autoComplete="new-password" required /></Field>
            {ps?.message && <div className="sm:col-span-2"><Alert tone="danger">{ps.message}</Alert></div>}
            <div><SubmitButton variant="outline" pendingText="Updating…">Update password</SubmitButton></div>
          </form>
        </Card>
      )}
    </>
  );
}
