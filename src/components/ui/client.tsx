"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Icon } from "@/components/ui/Icon";
import { buttonClass, cx } from "@/components/ui/primitives";
import { BASE_PATH } from "@/lib/paths";

const COOKIE_PATH = BASE_PATH || "/";
const setCookie = (k: string, v: string) => {
  document.cookie = `${k}=${v}; path=${COOKIE_PATH}; max-age=31536000; samesite=lax`;
};

export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  useEffect(() => setTheme((document.documentElement.dataset.theme as "dark" | "light") || "dark"), []);
  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    setCookie("ta_theme", next);
    try { localStorage.setItem("ta_theme", next); } catch { /* storage unavailable */ }
    setTheme(next);
    window.dispatchEvent(new CustomEvent("ta:theme", { detail: next }));
  };
  return (
    <button type="button" onClick={toggle} className={cx("grid size-10 place-items-center rounded-xl text-fg-2 transition hover:bg-surface-2 hover:text-fg", className)}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`} title="Toggle theme">
      <Icon name={theme === "dark" ? "sun" : "moon"} />
    </button>
  );
}

export function MotionToggle({ className }: { className?: string }) {
  const [reduced, setReduced] = useState(false);
  useEffect(() => setReduced(document.documentElement.dataset.motion === "reduced"), []);
  const toggle = () => {
    const next = !reduced;
    document.documentElement.dataset.motion = next ? "reduced" : "full";
    setCookie("ta_motion", next ? "reduced" : "full");
    setReduced(next);
    window.dispatchEvent(new CustomEvent("ta:motion", { detail: next ? "reduced" : "full" }));
  };
  return (
    <button type="button" onClick={toggle} aria-pressed={reduced} className={cx("rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted transition hover:bg-surface-2 hover:text-fg", className)}>
      {reduced ? "Motion: reduced" : "Reduce motion"}
    </button>
  );
}

export function SubmitButton({ children, pendingText, variant = "primary", size = "md", className, ...rest }:
  { children: ReactNode; pendingText?: string; variant?: "primary" | "secondary" | "ghost" | "danger" | "outline"; size?: "sm" | "md" | "lg"; className?: string; name?: string; value?: string; formAction?: (fd: FormData) => void }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-busy={pending} className={buttonClass(variant, size, className)} {...rest}>
      {pending && <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />}
      {pending ? pendingText ?? "Working…" : children}
    </button>
  );
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className={buttonClass("outline", "sm")}
      onClick={async () => { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1600); }}>
      <Icon name={done ? "check" : "copy"} size={14} /> {done ? "Copied" : label}
    </button>
  );
}

/** Wraps a destructive server action form with a confirm step (no blocking browser dialogs). */
export function ConfirmSubmit({ children, confirmText = "Are you sure?", variant = "danger", size = "sm" }: { children: ReactNode; confirmText?: string; variant?: "danger" | "primary" | "outline"; size?: "sm" | "md" }) {
  const [armed, setArmed] = useState(false);
  if (!armed) return <button type="button" className={buttonClass(variant === "danger" ? "outline" : variant, size)} onClick={() => setArmed(true)}>{children}</button>;
  return (
    <span className="inline-flex items-center gap-2">
      <span className="text-xs text-muted">{confirmText}</span>
      <SubmitButton variant={variant} size={size}>Confirm</SubmitButton>
      <button type="button" className={buttonClass("ghost", size)} onClick={() => setArmed(false)}>Cancel</button>
    </span>
  );
}

/** Adds .is-visible to [data-reveal] elements as they enter the viewport. */
export function RevealOnScroll() {
  useEffect(() => {
    const els = document.querySelectorAll<HTMLElement>(".reveal");
    if (!("IntersectionObserver" in window)) { els.forEach((e) => e.classList.add("is-visible")); return; }
    const io = new IntersectionObserver((entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("is-visible"); io.unobserve(e.target); } }), { rootMargin: "0px 0px -10% 0px" });
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, []);
  return null;
}

export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const read = () => setReduced(mq.matches || document.documentElement.dataset.motion === "reduced");
    read();
    mq.addEventListener("change", read);
    window.addEventListener("ta:motion", read);
    return () => { mq.removeEventListener("change", read); window.removeEventListener("ta:motion", read); };
  }, []);
  return reduced;
}

export function ActionButton({ action, children, variant = "outline", size = "sm" }: { action: () => Promise<unknown>; children: ReactNode; variant?: "outline" | "primary" | "ghost"; size?: "sm" | "md" }) {
  const [pending, start] = useTransition();
  return <button type="button" disabled={pending} className={buttonClass(variant, size)} onClick={() => start(async () => { await action(); })}>{pending ? "…" : children}</button>;
}
