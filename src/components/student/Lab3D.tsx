"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "@/components/ui/client";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/primitives";
import type { HotspotKey, LabHandle } from "@/three/labScene";

const HOTSPOTS: { key: HotspotKey; label: string; href: string; icon: string }[] = [
  { key: "courses", label: "My Courses", href: "/dashboard/courses", icon: "book" },
  { key: "embedded", label: "Embedded Systems", href: "/courses?category=embedded", icon: "chip" },
  { key: "robotics", label: "Robotics", href: "/courses?category=robotics", icon: "robot" },
  { key: "live", label: "Live Classes", href: "/dashboard/live", icon: "video" },
  { key: "bench", label: "Practical Resources", href: "/dashboard/resources", icon: "cpu" },
  { key: "certificates", label: "Certificates", href: "/dashboard/certificates", icon: "award" },
];

/**
 * Interactive miniature lab. The 3D canvas is decorative; the floating labels are real
 * links (keyboard/screen-reader accessible). Falls back to a tile grid without WebGL,
 * on small screens, or with reduced motion.
 */
export function Lab3D({ courses, nextClass }: { courses: string[]; nextClass: string }) {
  const router = useRouter();
  const reduced = useReducedMotion();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labelRefs = useRef<Partial<Record<HotspotKey, HTMLAnchorElement | null>>>({});
  const handle = useRef<LabHandle | null>(null);
  const [mode, setMode] = useState<"pending" | "3d" | "grid">("pending");
  const [hover, setHover] = useState<HotspotKey | null>(null);
  const [themeKey, setThemeKey] = useState(0);
  useEffect(() => {
    const on = () => setThemeKey((k) => k + 1); // rebuild the room with the new palette
    window.addEventListener("ta:theme", on);
    return () => window.removeEventListener("ta:theme", on);
  }, []);

  useEffect(() => {
    if (window.matchMedia("(max-width: 639px)").matches) { setMode("grid"); return; }
    let disposed = false;
    (async () => {
      const { webglAvailable } = await import("@/three/core");
      if (!webglAvailable()) { setMode("grid"); return; }
      const { mountLab } = await import("@/three/labScene");
      if (disposed || !canvasRef.current) return;
      handle.current = mountLab(canvasRef.current, {
        lowPower: (navigator.hardwareConcurrency ?? 8) <= 4, reducedMotion: reduced,
        onSelect: (k) => router.push(HOTSPOTS.find((h) => h.key === k)!.href),
        onHover: setHover,
        onAnchors: (a) => {
          for (const h of HOTSPOTS) {
            const el = labelRefs.current[h.key];
            const p = a[h.key];
            if (!el || !p) continue;
            el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -100%)`;
            el.style.opacity = p.visible ? "1" : "0";
          }
        },
      });
      handle.current.setScreens({ courses, nextClass });
      setMode("3d");
    })();
    return () => { disposed = true; handle.current?.dispose(); handle.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced, themeKey]);

  if (mode === "grid") {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {HOTSPOTS.map((h) => (
          <Link key={h.key} href={h.href} className="glass flex flex-col items-start gap-3 rounded-2xl p-4 transition hover:-translate-y-0.5">
            <span className="grid size-10 place-items-center rounded-xl bg-[color-mix(in_srgb,var(--brand)_16%,transparent)] text-brand"><Icon name={h.icon} /></span>
            <span className="text-sm font-semibold">{h.label}</span>
          </Link>
        ))}
      </div>
    );
  }

  return (
    <div className="glass relative h-[min(62vh,560px)] min-h-[380px] overflow-hidden rounded-3xl">
      <div className="absolute inset-0 bg-[radial-gradient(70%_80%_at_50%_30%,color-mix(in_srgb,var(--brand)_10%,transparent),transparent)]" />
      <canvas ref={canvasRef} className="absolute inset-0 size-full" aria-hidden="true" />
      {mode === "pending" && <div className="absolute inset-0 grid place-items-center"><div className="skeleton size-full rounded-none opacity-50" /></div>}
      <nav aria-label="Lab shortcuts" className="pointer-events-none absolute inset-0">
        {HOTSPOTS.map((h) => (
          <Link key={h.key} href={h.href} ref={(el) => { labelRefs.current[h.key] = el; }}
            className={cx("pointer-events-auto absolute left-0 top-0 flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold shadow-lg backdrop-blur-md transition-[opacity,background-color] duration-200 focus-visible:opacity-100",
              hover === h.key ? "border-brand bg-brand text-on-brand" : "border-line-strong bg-glass-strong text-fg")}
            style={{ opacity: 0 }} onMouseEnter={() => setHover(h.key)} onMouseLeave={() => setHover(null)}>
            <Icon name={h.icon} size={13} />{h.label}
          </Link>
        ))}
      </nav>
      <p className="label-mono absolute bottom-3 left-4">Your engineering lab · click any object</p>
    </div>
  );
}
