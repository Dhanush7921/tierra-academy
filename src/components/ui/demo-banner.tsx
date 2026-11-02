import { env } from "@/lib/env";

/** Persistent, clearly visible notice that integrations are simulated. */
export function DemoBanner() {
  if (env().APP_MODE !== "demo") return null;
  const e = env();
  const sims = [e.PAYMENTS_PROVIDER === "demo" && "payments", e.LIVE_PROVIDER === "demo" && "live classes", e.VIDEO_PROVIDER === "local" && "video hosting", e.EMAIL_PROVIDER === "outbox" && "email"].filter(Boolean);
  return (
    <div className="relative z-50 border-b border-[color-mix(in_srgb,var(--brand)_35%,transparent)] bg-[color-mix(in_srgb,var(--brand)_12%,var(--bg))] px-4 py-1.5 text-center text-xs text-fg-2">
      <strong className="font-semibold text-brand-strong">DEMO MODE</strong> — preview for review. Content is placeholder{sims.length ? `; ${sims.join(", ")} are simulated (no real transactions or conferences)` : ""}.
    </div>
  );
}
