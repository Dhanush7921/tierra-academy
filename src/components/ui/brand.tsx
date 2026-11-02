import Link from "next/link";
import Image from "next/image";
import { cx } from "@/components/ui/primitives";
import { asset } from "@/lib/paths";

/**
 * The original Tierra Automation logo is used exactly as supplied (circular mark on white).
 * On dark surfaces it sits on its own white disc so the artwork is never recoloured.
 */
export function LogoMark({ size = 40, className }: { size?: number; className?: string }) {
  return (
    <span className={cx("relative inline-grid shrink-0 place-items-center overflow-hidden rounded-full bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.04),0_8px_24px_-8px_rgba(255,122,0,0.55)]", className)} style={{ width: size, height: size }}>
      <Image src={asset("/brand/tierra-automation-logo-256.webp")} alt="Tierra Automation logo" width={size} height={size} priority />
    </span>
  );
}

export function Logo({ href = "/", compact = false }: { href?: string; compact?: boolean }) {
  return (
    <Link href={href} className="group inline-flex items-center gap-3" aria-label="Tierra Academy home">
      <LogoMark size={compact ? 34 : 40} />
      {!compact && (
        <span className="leading-none">
          <span className="block font-display text-[15px] font-bold tracking-[0.12em]">TIERRA <span className="text-gradient">ACADEMY</span></span>
          <span className="mt-1 block font-mono text-[10px] tracking-[0.22em] text-muted">LEARN · BUILD · AUTOMATE</span>
        </span>
      )}
    </Link>
  );
}

