"use client";

import { useActionState } from "react";
import { contactAction } from "@/app/actions/public";
import { Alert, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/client";
import type { FormState } from "@/lib/validation";

export function ContactForm() {
  const [state, action] = useActionState<FormState, FormData>(contactAction, undefined);
  if (state?.ok) return <Alert tone="ok" title="Message sent">{state.message}</Alert>;
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2" noValidate>
      <Field label="Your name" htmlFor="name" error={state?.errors?.name}><Input id="name" name="name" autoComplete="name" required /></Field>
      <Field label="Email" htmlFor="email" error={state?.errors?.email}><Input id="email" name="email" type="email" autoComplete="email" required /></Field>
      <Field label="Topic" htmlFor="topic" className="sm:col-span-2">
        <Select id="topic" name="topic" defaultValue="general"><option value="general">General</option><option value="courses">Courses</option><option value="payments">Payments</option><option value="partnership">Partnership</option><option value="support">Technical support</option></Select>
      </Field>
      <Field label="Message" htmlFor="message" error={state?.errors?.message} className="sm:col-span-2"><Textarea id="message" name="message" rows={6} required /></Field>
      <div aria-hidden="true" className="hidden"><label htmlFor="website">Website</label><input id="website" name="website" tabIndex={-1} autoComplete="off" /></div>
      {state?.message && !state.ok && <div className="sm:col-span-2"><Alert tone="danger">{state.message}</Alert></div>}
      <div className="sm:col-span-2"><SubmitButton pendingText="Sending…">Send message</SubmitButton></div>
    </form>
  );
}
