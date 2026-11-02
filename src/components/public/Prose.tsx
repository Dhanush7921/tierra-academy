import type { ReactNode } from "react";

export function ProsePage({ eyebrow, title, updated, children }: { eyebrow: string; title: string; updated?: string; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
      <p className="label-mono mb-2">{eyebrow}</p>
      <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
      {updated && <p className="mt-2 text-sm text-muted">Last updated {updated}</p>}
      <div className="mt-8 space-y-5 leading-relaxed text-fg-2 [&_h2]:mt-10 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-fg [&_li]:ml-5 [&_li]:list-disc [&_a]:text-brand-strong [&_a]:underline">
        {children}
      </div>
    </div>
  );
}

export function DraftNotice() {
  return (
    <p className="rounded-xl border border-dashed border-[color-mix(in_srgb,var(--warn)_60%,transparent)] p-4 text-sm">
      <b className="text-warn">Draft for review.</b> This policy text is a starting template prepared for the demo. It must be reviewed by Tierra Automation (and its legal advisers) before the academy goes live.
    </p>
  );
}
