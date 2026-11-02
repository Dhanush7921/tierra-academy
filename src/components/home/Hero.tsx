"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { buttonClass } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/Icon";
import { useReducedMotion } from "@/components/ui/client";
import { BoardIllustration } from "@/components/home/BoardIllustration";
import type { HeroHandle } from "@/three/heroScene";

/** SCENE 1 — ENGINEERING AWAKENS. 3D is lazy-loaded; text and CTAs are usable immediately. */
export function Hero() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handle = useRef<HeroHandle | null>(null);
  const reduced = useReducedMotion();
  const [mode, setMode] = useState<"loading" | "3d" | "static">("loading");
  const [assembled, setAssembled] = useState(false);
  const headRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    let disposed = false;
    (async () => {
      const { webglAvailable } = await import("@/three/core");
      const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
      if (!webglAvailable() || saveData) { setMode("static"); return; }
      const { mountHero } = await import("@/three/heroScene");
      if (disposed || !canvasRef.current) return;
      const lowPower = window.innerWidth < 768 || (navigator.hardwareConcurrency ?? 8) <= 4;
      handle.current = mountHero(canvasRef.current, { reducedMotion: reduced, lowPower, onAssembled: () => setAssembled(true) });
      setMode("3d");
    })();
    return () => { disposed = true; handle.current?.dispose(); handle.current = null; };
  }, [reduced]);

  // headline word reveal (GSAP), skipped for reduced motion
  useEffect(() => {
    if (reduced || !headRef.current) return;
    let ctx: { revert: () => void } | undefined;
    (async () => {
      const { gsap } = await import("gsap");
      ctx = gsap.context(() => {
        gsap.from("[data-hero-word]", { yPercent: 110, opacity: 0, duration: 0.9, ease: "power3.out", stagger: 0.12, delay: 0.15 });
        gsap.from("[data-hero-fade]", { y: 16, opacity: 0, duration: 0.8, ease: "power2.out", stagger: 0.08, delay: 0.55 });
      }, headRef.current!.parentElement!);
    })();
    return () => ctx?.revert();
  }, [reduced]);

  const skip = () => { handle.current?.skip(); setAssembled(true); };

  return (
    <section aria-labelledby="hero-title" className="relative isolate min-h-[100svh] overflow-hidden">
      <div className="absolute inset-0 -z-10 bg-blueprint opacity-50 [mask-image:radial-gradient(70%_60%_at_60%_40%,#000,transparent)]" />
      <div className="absolute inset-0 -z-10" aria-hidden="true">
        {mode !== "static" && <canvas ref={canvasRef} className="size-full" />}
        {mode === "static" && <div className="absolute inset-y-0 right-0 flex w-full items-center justify-center md:w-3/5"><BoardIllustration className="w-[min(92%,640px)] opacity-90" /></div>}
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-40 bg-gradient-to-t from-bg to-transparent" />

      <div className="mx-auto flex min-h-[100svh] max-w-7xl flex-col justify-center px-4 pb-24 pt-10 sm:px-6">
        <div className="max-w-xl">
          <p data-hero-fade className="label-mono mb-5 inline-flex items-center gap-2 rounded-full border border-line-strong bg-glass px-3 py-1.5 backdrop-blur">
            <span className="size-1.5 animate-pulse rounded-full bg-brand" /> Tierra Automation presents
          </p>
          <h1 id="hero-title" ref={headRef} className="font-display text-[clamp(2.6rem,7vw,5.6rem)] font-semibold leading-[0.95] tracking-tight">
            <span className="sr-only">Tierra Academy — Learn. Build. Automate.</span>
            <span aria-hidden="true" className="block">
              {["Learn.", "Build.", "Automate."].map((w, i) => (
                <span key={w} className="block overflow-hidden pb-1"><span data-hero-word className={`inline-block ${i === 2 ? "text-gradient" : ""}`}>{w}</span></span>
              ))}
            </span>
          </h1>
          <p data-hero-fade className="mt-6 max-w-md text-base leading-relaxed text-fg-2 sm:text-lg">
            Tierra Academy is a hands-on engineering school for electronics, robotics, IoT, embedded systems, electrical and mechanical engineering — live classes and recorded courses, built by Tierra Automation.
          </p>
          <div data-hero-fade className="pointer-events-auto mt-8 flex flex-wrap gap-3">
            <Link href="/courses" className={buttonClass("primary", "lg")}>Explore Courses <Icon name="arrow" size={18} /></Link>
            <Link href="/live" className={buttonClass("secondary", "lg")}><span className="relative mr-1 flex size-2.5"><span className="absolute inline-flex size-full animate-ping rounded-full bg-danger opacity-60" /><span className="relative inline-flex size-2.5 rounded-full bg-danger" /></span>Join Live Classes</Link>
          </div>
          <dl data-hero-fade className="mt-10 grid max-w-md grid-cols-3 gap-4 border-t border-line pt-6">
            {[["6", "Disciplines"], ["Live + Recorded", "Learning modes"], ["Verifiable", "Certificates"]].map(([v, l]) => (
              <div key={l}><dt className="sr-only">{l}</dt><dd className="font-display text-sm font-semibold sm:text-base">{v}</dd><dd className="text-xs text-muted">{l}</dd></div>
            ))}
          </dl>
        </div>
      </div>

      <div className="absolute bottom-6 left-0 right-0 mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6">
        <a href="#world" className="label-mono flex items-center gap-2 hover:text-fg"><span className="grid size-8 place-items-center rounded-full border border-line-strong"><Icon name="down" size={14} /></span>Scroll to enter the lab</a>
        {mode === "3d" && !assembled && !reduced && (
          <button type="button" onClick={skip} className="rounded-full border border-line-strong bg-glass px-3 py-1.5 text-xs font-medium text-fg-2 backdrop-blur hover:text-fg">Skip animation</button>
        )}
      </div>
    </section>
  );
}
