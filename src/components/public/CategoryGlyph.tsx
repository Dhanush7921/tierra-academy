/** Line-art glyphs for the six disciplines (original artwork, theme-colourable). */
export function CategoryGlyph({ slug, className, color = "currentColor" }: { slug: string; className?: string; color?: string }) {
  const common = { fill: "none", stroke: color, strokeWidth: 2.2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const body = (() => {
    switch (slug) {
      case "electronics":
        return (<g {...common}><rect x="22" y="30" width="56" height="40" rx="4" /><path d="M10 40h12M10 60h12M78 40h12M78 60h12M34 30V18M50 30V18M66 30V18M34 70v12M50 70v12M66 70v12" /><path d="M36 50h8l3-6 6 12 3-6h8" /></g>);
      case "robotics":
        return (<g {...common}><path d="M20 84h36M28 84V72h20v12" /><circle cx="38" cy="66" r="5" /><path d="M38 61L52 36" /><circle cx="52" cy="34" r="4" /><path d="M55 32l20-8" /><path d="M75 24l8-6M75 24l8 4" /></g>);
      case "iot":
        return (<g {...common}><circle cx="50" cy="62" r="5" /><path d="M36 50a20 20 0 0 1 28 0M28 42a31 31 0 0 1 44 0M20 34a42 42 0 0 1 60 0" /><rect x="40" y="70" width="20" height="14" rx="2" /></g>);
      case "embedded":
        return (<g {...common}><rect x="30" y="30" width="40" height="40" rx="3" /><rect x="40" y="40" width="20" height="20" /><path d="M38 30v-8M46 30v-8M54 30v-8M62 30v-8M38 70v8M46 70v8M54 70v8M62 70v8M30 38h-8M30 46h-8M30 54h-8M30 62h-8M70 38h8M70 46h8M70 54h8M70 62h8" /></g>);
      case "electrical":
        return (<g {...common}><path d="M56 14L30 54h18l-6 32 28-42H52z" /><path d="M14 80h14M72 80h14" /></g>);
      case "mechanical":
        return (<g {...common}><circle cx="42" cy="54" r="16" /><circle cx="42" cy="54" r="5" /><path d="M42 32v6M42 70v6M20 54h6M58 54h6M27 39l4 4M53 65l4 4M27 69l4-4M53 43l4-4" /><circle cx="72" cy="30" r="10" /><circle cx="72" cy="30" r="3" /></g>);
      default:
        return <circle cx="50" cy="50" r="20" {...common} />;
    }
  })();
  return <svg viewBox="0 0 100 100" className={className} aria-hidden="true">{body}</svg>;
}
