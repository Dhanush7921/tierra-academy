import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary: "text-on-brand bg-[linear-gradient(135deg,var(--brand),var(--brand-2))] shadow-[0_10px_30px_-10px_var(--brand)] hover:brightness-110",
  secondary: "glass text-fg hover:border-line-strong",
  outline: "border border-line-strong text-fg hover:bg-surface-2",
  ghost: "text-fg-2 hover:text-fg hover:bg-surface-2",
  danger: "bg-danger text-white hover:brightness-110",
};
const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-sm gap-1.5 rounded-lg",
  md: "h-10 px-4 text-sm gap-2 rounded-xl",
  lg: "h-12 px-6 text-base gap-2 rounded-2xl",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", extra?: string) {
  return cx("inline-flex items-center justify-center font-semibold transition-all duration-200 select-none disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap", variants[variant], sizes[size], extra);
}

export function Button({ variant = "primary", size = "md", className, ...rest }: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return <button className={buttonClass(variant, size, className)} {...rest} />;
}

export function ButtonLink({ href, variant = "primary", size = "md", className, children, ...rest }: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link href={href} className={buttonClass(variant, size, className)} {...rest}>{children}</Link>;
}

export function Card({ className, children, strong, ...rest }: ComponentProps<"div"> & { strong?: boolean }) {
  return <div className={cx(strong ? "glass-strong" : "glass", "rounded-2xl", className)} {...rest}>{children}</div>;
}

const tones = {
  neutral: "bg-surface-2 text-fg-2 border-line",
  brand: "bg-[color-mix(in_srgb,var(--brand)_14%,transparent)] text-brand-strong border-[color-mix(in_srgb,var(--brand)_30%,transparent)]",
  ok: "bg-[color-mix(in_srgb,var(--ok)_14%,transparent)] text-ok border-[color-mix(in_srgb,var(--ok)_30%,transparent)]",
  warn: "bg-[color-mix(in_srgb,var(--warn)_14%,transparent)] text-warn border-[color-mix(in_srgb,var(--warn)_30%,transparent)]",
  danger: "bg-[color-mix(in_srgb,var(--danger)_14%,transparent)] text-danger border-[color-mix(in_srgb,var(--danger)_30%,transparent)]",
  info: "bg-[color-mix(in_srgb,var(--info)_14%,transparent)] text-info border-[color-mix(in_srgb,var(--info)_30%,transparent)]",
};
export type Tone = keyof typeof tones;

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cx("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase", tones[tone], className)}>{children}</span>;
}

export const STATUS_TONE: Record<string, Tone> = {
  DRAFT: "neutral", REVIEW: "warn", APPROVED: "info", REJECTED: "danger", PUBLISHED: "ok", ARCHIVED: "neutral",
  PROPOSED: "warn", SCHEDULED: "info", LIVE: "danger", ENDED: "neutral", CANCELLED: "neutral",
  ACTIVE: "ok", COMPLETED: "brand", REVOKED: "danger", REFUNDED: "warn",
  CREATED: "neutral", PENDING: "warn", PAID: "ok", FAILED: "danger", PARTIALLY_REFUNDED: "warn",
  REQUESTED: "warn", PROCESSING: "info", PROCESSED: "ok", SUBMITTED: "warn", GRADED: "ok", RETURNED: "info",
  READY: "ok", ERROR: "danger", UPLOADING: "info", PENDING_UPLOAD: "neutral", SENT: "ok", DEV_OUTBOX: "info", QUEUED: "neutral",
};

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={STATUS_TONE[status] ?? "neutral"}>{status.replace(/_/g, " ").toLowerCase()}</Badge>;
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && <p className="label-mono mb-1">{eyebrow}</p>}
        <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ icon = "layers", title, description, action }: { icon?: string; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line-strong px-6 py-14 text-center">
      <div className="mb-3 grid size-12 place-items-center rounded-2xl bg-surface-2 text-brand"><Icon name={icon} size={22} /></div>
      <p className="font-semibold">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function StatCard({ label, value, hint, icon, accent }: { label: string; value: ReactNode; hint?: ReactNode; icon?: string; accent?: string }) {
  return (
    <Card className="relative overflow-hidden p-5 transition-transform duration-300 hover:-translate-y-1">
      <div className="pointer-events-none absolute -right-8 -top-8 size-28 rounded-full opacity-30 blur-2xl" style={{ background: accent ?? "var(--brand)" }} />
      <div className="flex items-start justify-between">
        <p className="text-sm text-muted">{label}</p>
        {icon && <span className="grid size-9 place-items-center rounded-xl bg-surface-2 text-brand"><Icon name={icon} size={17} /></span>}
      </div>
      <p className="mt-3 font-display text-2xl font-semibold tracking-tight">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </Card>
  );
}

export function ProgressBar({ value, label }: { value: number; label?: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div role="progressbar" aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100} aria-label={label ?? "Progress"}>
      <div className="h-2 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full bg-[linear-gradient(90deg,var(--brand),var(--brand-3))] transition-[width] duration-700" style={{ width: `${v}%` }} />
      </div>
    </div>
  );
}

export function Field({ label, htmlFor, hint, error, children, className }: { label: string; htmlFor: string; hint?: string; error?: string; children: ReactNode; className?: string }) {
  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-sm font-medium text-fg-2">{label}</label>
      {children}
      {hint && !error && <p className="text-xs text-muted">{hint}</p>}
      {error && <p className="text-xs text-danger" role="alert">{error}</p>}
    </div>
  );
}

export const inputClass = "w-full rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 text-sm text-fg placeholder:text-muted/70 transition focus:border-brand focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--brand)_30%,transparent)] disabled:opacity-60";

export function Input(props: ComponentProps<"input">) {
  return <input {...props} className={cx(inputClass, props.className)} />;
}
export function Textarea(props: ComponentProps<"textarea">) {
  return <textarea rows={4} {...props} className={cx(inputClass, "min-h-24", props.className)} />;
}
export function Select(props: ComponentProps<"select">) {
  return <select {...props} className={cx(inputClass, "pr-8", props.className)} />;
}

export function Alert({ tone = "info", children, title }: { tone?: "info" | "ok" | "warn" | "danger"; children: ReactNode; title?: string }) {
  const icon = tone === "ok" ? "check" : tone === "info" ? "info" : "alert";
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cx("flex gap-3 rounded-xl border p-3.5 text-sm", tones[tone])} style={{ textTransform: "none", letterSpacing: 0 }}>
      <Icon name={icon} size={18} className="mt-0.5 shrink-0" />
      <div className="font-normal">{title && <p className="font-semibold">{title}</p>}{children}</div>
    </div>
  );
}

export function Avatar({ name, src, size = 36 }: { name: string; src?: string | null; size?: number }) {
  const ini = name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("") || "TA";
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" width={size} height={size} className="rounded-full object-cover" />
  ) : (
    <span className="grid shrink-0 place-items-center rounded-full bg-[linear-gradient(135deg,var(--brand),var(--brand-2))] font-semibold text-on-brand" style={{ width: size, height: size, fontSize: size * 0.38 }} aria-hidden="true">{ini}</span>
  );
}
