"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type PointerEvent as RPE } from "react";
import { buttonClass, cx } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/Icon";
import { LogoMark } from "@/components/ui/brand";
import { useReducedMotion } from "@/components/ui/client";
import { CourseCard } from "@/components/public/CourseCard";
import type { CourseCardData } from "@/lib/services/catalog";

function useTilt() {
  const ref = useRef<HTMLAnchorElement>(null);
  const reduced = useReducedMotion();
  const onMove = (e: RPE<HTMLAnchorElement>) => {
    if (reduced || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
    ref.current.style.transform = `perspective(900px) rotateY(${x * 8}deg) rotateX(${-y * 8}deg) translateY(-4px)`;
    ref.current.style.setProperty("--mx", `${(x + 0.5) * 100}%`);
    ref.current.style.setProperty("--my", `${(y + 0.5) * 100}%`);
  };
  const onLeave = () => { if (ref.current) ref.current.style.transform = ""; };
  return { ref, onPointerMove: onMove, onPointerLeave: onLeave };
}

/** SCENE 9 — LEARNING OPTIONS */
export function LearningOptions() {
  const live = useTilt();
  const rec = useTilt();
  return (
    <section aria-labelledby="options-title" className="mx-auto max-w-7xl px-4 py-24 sm:px-6">
      <div className="reveal">
        <p className="label-mono mb-3">Scene 9 · How you learn</p>
        <h2 id="options-title" className="max-w-2xl font-display text-3xl font-semibold tracking-tight sm:text-4xl">Two ways in. Same hands-on standard.</h2>
      </div>
      <div className="mt-10 grid gap-5 md:grid-cols-2">
        <Link href="/live" {...live} className="reveal group glass-strong relative block overflow-hidden rounded-3xl p-8 transition-transform duration-300 will-change-transform [background-image:radial-gradient(500px_circle_at_var(--mx,50%)_var(--my,50%),color-mix(in_srgb,var(--danger)_14%,transparent),transparent_60%)]">
          <div className="flex items-center gap-2 text-sm font-semibold text-danger"><span className="relative flex size-2.5"><span className="absolute inline-flex size-full animate-ping rounded-full bg-danger opacity-70" /><span className="relative inline-flex size-2.5 rounded-full bg-danger" /></span>LIVE CLASSES</div>
          <h3 className="mt-4 font-display text-2xl font-semibold">Build alongside an instructor, in real time.</h3>
          <p className="mt-3 max-w-md text-fg-2">Scheduled sessions with camera, mic, chat and screen-share, attendance tracking and recordings for enrolled students.</p>
          <svg viewBox="0 0 400 90" className="mt-8 w-full" aria-hidden="true">
            <path d="M0 45 H90 L105 15 L125 75 L145 25 L160 55 L175 45 H400" fill="none" stroke="var(--danger)" strokeWidth="3" strokeLinecap="round" strokeDasharray="8 10" className="animate-trace" />
          </svg>
          <span className="mt-6 inline-flex items-center gap-2 font-semibold text-brand-strong">See upcoming sessions <Icon name="arrow" size={16} className="transition group-hover:translate-x-1" /></span>
        </Link>
        <Link href="/courses?delivery=RECORDED" {...rec} className="reveal group glass-strong relative block overflow-hidden rounded-3xl p-8 transition-transform duration-300 will-change-transform [background-image:radial-gradient(500px_circle_at_var(--mx,50%)_var(--my,50%),color-mix(in_srgb,var(--brand)_16%,transparent),transparent_60%)]">
          <div className="flex items-center gap-2 text-sm font-semibold text-brand-strong"><Icon name="play" size={14} />RECORDED COURSES</div>
          <h3 className="mt-4 font-display text-2xl font-semibold">Learn at your pace. Resume where you stopped.</h3>
          <p className="mt-3 max-w-md text-fg-2">Secure streaming lessons with playback speed, captions, notes and progress saved automatically across devices.</p>
          <div className="mt-8 space-y-2" aria-hidden="true">
            {[78, 46, 20].map((w, i) => (
              <div key={i} className="flex items-center gap-3"><span className="grid size-7 place-items-center rounded-lg bg-surface-2"><Icon name={i === 0 ? "check" : "play"} size={12} /></span><div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-[linear-gradient(90deg,var(--brand),var(--brand-3))] transition-[width] duration-1000 group-hover:w-full" style={{ width: `${w}%` }} /></div></div>
            ))}
          </div>
          <span className="mt-6 inline-flex items-center gap-2 font-semibold text-brand-strong">Browse recorded courses <Icon name="arrow" size={16} className="transition group-hover:translate-x-1" /></span>
        </Link>
      </div>
    </section>
  );
}

/** SCENE 10 — COURSE DISCOVERY (client-side quick filter over featured courses). */
export function CourseDiscovery({ courses, categories }: { courses: CourseCardData[]; categories: { slug: string; name: string }[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string | null>(null);
  const [price, setPrice] = useState<"all" | "free" | "paid">("all");
  const list = useMemo(() => courses.filter((c) =>
    (!cat || c.category_slug === cat) && (price === "all" || (price === "free" ? c.is_free : !c.is_free)) &&
    (!q || `${c.title} ${c.subtitle} ${c.category_name}`.toLowerCase().includes(q.toLowerCase()))).slice(0, 6), [courses, q, cat, price]);
  return (
    <section aria-labelledby="discover-title" className="mx-auto max-w-7xl px-4 py-24 sm:px-6">
      <div className="reveal flex flex-col justify-between gap-6 md:flex-row md:items-end">
        <div>
          <p className="label-mono mb-3">Scene 10 · Course discovery</p>
          <h2 id="discover-title" className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">Find your next build.</h2>
        </div>
        <form role="search" onSubmit={(e) => { e.preventDefault(); router.push(`/courses?q=${encodeURIComponent(q)}${cat ? `&category=${cat}` : ""}`); }} className="glass flex w-full max-w-md items-center gap-2 rounded-2xl p-1.5">
          <label htmlFor="home-search" className="sr-only">Search courses</label>
          <Icon name="search" className="ml-2 text-muted" />
          <input id="home-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Try “ESP32”, “PLC”, “gears”…" className="h-10 flex-1 bg-transparent text-sm outline-none placeholder:text-muted" />
          <button className={buttonClass("primary", "sm")} type="submit">Search</button>
        </form>
      </div>
      <div className="reveal mt-6 flex flex-wrap gap-2" role="group" aria-label="Filter by discipline">
        <Chip on={!cat} onClick={() => setCat(null)}>All</Chip>
        {categories.map((c) => <Chip key={c.slug} on={cat === c.slug} onClick={() => setCat(c.slug)}>{c.name}</Chip>)}
        <span className="mx-1 w-px self-stretch bg-line" />
        {(["all", "free", "paid"] as const).map((p) => <Chip key={p} on={price === p} onClick={() => setPrice(p)}>{p === "all" ? "Any price" : p === "free" ? "Free" : "Paid"}</Chip>)}
      </div>
      <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((c, i) => <div key={c.id} className="animate-rise" style={{ animationDelay: `${i * 60}ms` }}><CourseCard c={c} /></div>)}
        {!list.length && <p className="col-span-full rounded-2xl border border-dashed border-line-strong p-10 text-center text-muted">No featured course matches — try the <Link className="text-brand-strong underline" href={`/courses?q=${encodeURIComponent(q)}`}>full catalogue</Link>.</p>}
      </div>
      <div className="mt-10 text-center"><Link href="/courses" className={buttonClass("outline", "lg")}>Browse the full catalogue <Icon name="arrow" size={16} /></Link></div>
    </section>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" aria-pressed={on} onClick={onClick} className={cx("rounded-full border px-3.5 py-1.5 text-sm transition", on ? "border-transparent bg-brand font-semibold text-on-brand" : "border-line-strong text-fg-2 hover:border-brand hover:text-fg")}>{children}</button>;
}

/** SCENE 11 — LEARNING PROCESS: a circuit trace draws itself as you scroll. */
const STEPS = [
  ["user", "Register", "Create your free student account in a minute."],
  ["book", "Enroll", "Join free courses instantly or check out securely for paid ones."],
  ["play", "Learn", "Stream lessons, join live classes and download notes."],
  ["cpu", "Practice", "Quizzes, assignments and hands-on build tasks."],
  ["check", "Complete", "Finish the required lessons and assessments."],
  ["award", "Certificate", "Earn a certificate with a public verification ID."],
] as const;

export function Process() {
  const ref = useRef<HTMLDivElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (reduced || !ref.current) return;
    let kill: (() => void) | undefined;
    (async () => {
      const [{ gsap }, { ScrollTrigger }] = await Promise.all([import("gsap"), import("gsap/ScrollTrigger")]);
      gsap.registerPlugin(ScrollTrigger);
      const len = pathRef.current!.getTotalLength();
      gsap.set(pathRef.current, { strokeDasharray: len, strokeDashoffset: len });
      const tw = gsap.to(pathRef.current, { strokeDashoffset: 0, ease: "none", scrollTrigger: { trigger: ref.current, start: "top 75%", end: "bottom 60%", scrub: true } });
      const nodes = gsap.fromTo("[data-step]", { opacity: 0.25, y: 12 }, { opacity: 1, y: 0, stagger: 0.25, ease: "power2.out", scrollTrigger: { trigger: ref.current, start: "top 70%", end: "bottom 65%", scrub: true } });
      kill = () => { tw.scrollTrigger?.kill(); nodes.scrollTrigger?.kill(); tw.kill(); nodes.kill(); };
    })();
    return () => kill?.();
  }, [reduced]);
  return (
    <section aria-labelledby="process-title" className="mx-auto max-w-7xl px-4 py-24 sm:px-6">
      <p className="label-mono mb-3">Scene 11 · Learning process</p>
      <h2 id="process-title" className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">From sign-up to certificate.</h2>
      <div ref={ref} className="relative mt-14">
        <svg className="pointer-events-none absolute left-0 top-7 hidden h-4 w-full lg:block" viewBox="0 0 1000 16" preserveAspectRatio="none" aria-hidden="true">
          <path d="M40 8 H960" stroke="var(--line-strong)" strokeWidth="2" fill="none" />
          <path ref={pathRef} d="M40 8 H960" stroke="url(#proc-g)" strokeWidth="3" fill="none" strokeLinecap="round" />
          <defs><linearGradient id="proc-g"><stop offset="0" stopColor="var(--brand)" /><stop offset="1" stopColor="var(--brand-3)" /></linearGradient></defs>
        </svg>
        <ol className="relative grid gap-6 sm:grid-cols-2 lg:grid-cols-6">
          {STEPS.map(([icon, t, d], i) => (
            <li key={t} data-step className="relative">
              <div className="relative z-10 grid size-14 place-items-center rounded-2xl border border-line-strong bg-surface text-brand shadow-[0_0_0_6px_var(--bg)]"><Icon name={icon} size={22} /></div>
              <p className="mt-4 font-mono text-xs text-muted">0{i + 1}</p>
              <h3 className="font-display text-lg font-semibold">{t}</h3>
              <p className="mt-1 text-sm text-muted">{d}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/** SCENE 12 — FINAL CTA: brand reveal. */
export function FinalCta() {
  return (
    <section aria-labelledby="cta-title" className="relative mx-auto max-w-7xl px-4 py-24 sm:px-6">
      <div className="reveal glass-strong relative overflow-hidden rounded-[2rem] px-6 py-16 text-center sm:px-16">
        <div className="absolute inset-0 bg-blueprint opacity-40" aria-hidden="true" />
        <div className="relative mx-auto grid size-44 place-items-center" aria-hidden="true">
          <span className="absolute inset-0 animate-spin-slow rounded-full border border-dashed border-[color-mix(in_srgb,var(--brand)_50%,transparent)]" />
          <span className="absolute inset-5 animate-[spin_12s_linear_infinite_reverse] rounded-full border border-[color-mix(in_srgb,var(--brand-3)_40%,transparent)]" />
          <span className="absolute size-3 animate-pulse rounded-full bg-brand shadow-[0_0_20px_var(--brand)]" style={{ top: 2, left: "50%" }} />
          <LogoMark size={96} />
        </div>
        <h2 id="cta-title" className="relative mt-8 font-display text-3xl font-semibold tracking-tight sm:text-5xl">Your engineering lab is <span className="text-gradient">ready.</span></h2>
        <p className="relative mx-auto mt-4 max-w-xl text-fg-2">Create a free account, start with a free course, and build your first project this week.</p>
        <div className="relative mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/register" className={buttonClass("primary", "lg")}>Start learning free</Link>
          <Link href="/courses" className={buttonClass("secondary", "lg")}>Explore courses</Link>
        </div>
      </div>
    </section>
  );
}
