"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { buttonClass, cx } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/Icon";
import { useReducedMotion } from "@/components/ui/client";
import { CategoryGlyph } from "@/components/public/CategoryGlyph";
import type { WorldHandle } from "@/three/worldScene";

export interface WorldCategory {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  accent: string;
  course_count: number;
}

const ORDER = ["electronics", "robotics", "iot", "embedded", "electrical", "mechanical"];
const SCENE_COPY: Record<string, string> = {
  electronics: "Circuit boards, resistors, capacitors and sensors — follow the current as it lights up every copper trace.",
  robotics: "Servos, joints and a working robotic arm — learn the kinematics that make machines move with intent.",
  iot: "Wireless signals link sensors and smart devices to a live data dashboard.",
  embedded: "Microcontrollers, firmware flow and the UART, I²C, SPI and CAN buses that tie products together.",
  electrical: "Motors, power circuits and control panels — watch the current flow from the switchgear to the shaft.",
  mechanical: "Gear trains and exploded CAD assemblies — the mechanisms behind every automated system.",
};

/** SCENES 2–8 — scroll-driven tour of the engineering campus (desktop), card grid fallback (mobile / no WebGL). */
export function World({ categories }: { categories: WorldCategory[] }) {
  const cats = ORDER.map((s) => categories.find((c) => c.slug === s)).filter(Boolean) as WorldCategory[];
  const router = useRouter();
  const reduced = useReducedMotion();
  const sectionRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handle = useRef<WorldHandle | null>(null);
  const [mode, setMode] = useState<"pending" | "3d" | "cards">("pending");
  const [active, setActive] = useState(-1);

  useEffect(() => {
    const small = window.matchMedia("(max-width: 767px)").matches;
    if (small || reduced) { setMode("cards"); return; }
    let disposed = false;
    let cleanupScroll: (() => void) | undefined;
    const io = new IntersectionObserver(async ([e]) => {
      if (!e.isIntersecting || handle.current) return;
      io.disconnect();
      const { webglAvailable } = await import("@/three/core");
      if (!webglAvailable()) { setMode("cards"); return; }
      const [{ mountWorld }, { gsap }, { ScrollTrigger }] = await Promise.all([import("@/three/worldScene"), import("gsap"), import("gsap/ScrollTrigger")]);
      if (disposed || !canvasRef.current || !sectionRef.current) return;
      gsap.registerPlugin(ScrollTrigger);
      handle.current = mountWorld(canvasRef.current, { lowPower: (navigator.hardwareConcurrency ?? 8) <= 4, onSelect: (slug) => router.push(`/courses?category=${slug}`) });
      setMode("3d");
      const st = ScrollTrigger.create({
        trigger: sectionRef.current, start: "top top", end: "bottom bottom", scrub: true,
        onUpdate: (self) => {
          handle.current?.setProgress(self.progress);
          const idx = Math.round(self.progress * 7) - 1;
          setActive(idx >= 0 && idx < 6 ? idx : -1);
        },
      });
      cleanupScroll = () => st.kill();
    }, { rootMargin: "400px" });
    setMode("3d");
    if (sectionRef.current) io.observe(sectionRef.current);
    return () => { disposed = true; io.disconnect(); cleanupScroll?.(); handle.current?.dispose(); handle.current = null; };
  }, [reduced, router]);

  const jumpTo = (i: number) => {
    const el = sectionRef.current;
    if (!el) return;
    const top = el.offsetTop + ((i + 1) / 7) * (el.offsetHeight - window.innerHeight);
    window.scrollTo({ top, behavior: reduced ? "auto" : "smooth" });
  };

  if (mode === "cards") {
    return (
      <section id="world" aria-labelledby="world-title" className="mx-auto max-w-7xl px-4 py-24 sm:px-6">
        <p className="label-mono mb-3">Enter the engineering world</p>
        <h2 id="world-title" className="max-w-2xl font-display text-3xl font-semibold tracking-tight sm:text-4xl">Six labs. One campus. Pick where you want to build.</h2>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cats.map((c) => (
            <Link key={c.slug} href={`/courses?category=${c.slug}`} className="group glass relative overflow-hidden rounded-2xl p-6 transition hover:-translate-y-1">
              <div className="absolute -right-10 -top-10 size-40 rounded-full opacity-25 blur-2xl transition group-hover:opacity-45" style={{ background: c.accent }} />
              <CategoryGlyph slug={c.slug} color={c.accent} className="size-14 transition duration-500 group-hover:scale-110" />
              <h3 className="mt-4 font-display text-lg font-semibold">{c.name}</h3>
              <p className="mt-1 text-sm text-muted">{SCENE_COPY[c.slug]}</p>
              <p className="mt-4 text-sm font-semibold" style={{ color: c.accent }}>{c.course_count} course{c.course_count === 1 ? "" : "s"} →</p>
            </Link>
          ))}
        </div>
      </section>
    );
  }

  const cur = active >= 0 ? cats[active] : null;
  return (
    <section id="world" ref={sectionRef} aria-labelledby="world-title" className="relative h-[760vh]">
      <div className="sticky top-0 h-[100svh] overflow-hidden">
        <canvas ref={canvasRef} className="absolute inset-0 size-full" aria-hidden="true" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(80%_70%_at_50%_45%,transparent,var(--bg)_92%)]" />

        <div className="relative mx-auto flex h-full max-w-7xl flex-col justify-between px-4 pb-10 pt-24 sm:px-6">
          <div className={cx("max-w-lg transition-all duration-700", cur ? "pointer-events-none -translate-y-4 opacity-0" : "opacity-100")}>
            <p className="label-mono mb-3">Scene 2 · Enter the engineering world</p>
            <h2 id="world-title" className="font-display text-3xl font-semibold tracking-tight sm:text-5xl">Six labs.<br />One campus.</h2>
            <p className="mt-4 text-fg-2">Keep scrolling to fly through each discipline — or click any station to open its courses.</p>
          </div>

          <div className="flex items-end justify-between gap-6">
            <div aria-live="polite" className={cx("glass-strong max-w-md rounded-3xl p-6 transition-all duration-500", cur ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-6 opacity-0")}>
              {cur && (
                <>
                  <p className="label-mono" style={{ color: cur.accent }}>Scene {active + 3} · {cur.tagline}</p>
                  <h3 className="mt-2 font-display text-2xl font-semibold">{cur.name}</h3>
                  <p className="mt-2 text-sm text-fg-2">{SCENE_COPY[cur.slug]}</p>
                  <div className="mt-5 flex items-center gap-3">
                    <Link href={`/courses?category=${cur.slug}`} className={buttonClass("primary", "md")}>Explore {cur.name} courses <Icon name="arrow" size={16} /></Link>
                    <span className="text-xs text-muted">{cur.course_count} available</span>
                  </div>
                </>
              )}
            </div>
            <nav aria-label="Engineering disciplines" className="glass hidden flex-col gap-1 rounded-2xl p-2 lg:flex">
              {cats.map((c, i) => (
                <button key={c.slug} type="button" onClick={() => jumpTo(i)} aria-current={i === active ? "true" : undefined}
                  className={cx("flex items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm transition", i === active ? "bg-surface-2 font-semibold text-fg" : "text-muted hover:text-fg")}>
                  <span className="size-2 rounded-full" style={{ background: c.accent, boxShadow: i === active ? `0 0 12px ${c.accent}` : undefined }} />{c.name}
                </button>
              ))}
            </nav>
          </div>
        </div>
      </div>
    </section>
  );
}
