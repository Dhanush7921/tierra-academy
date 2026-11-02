import Link from "next/link";
import type { CourseCardData } from "@/lib/services/catalog";
import { formatMoney } from "@/lib/format";
import { CategoryGlyph } from "@/components/public/CategoryGlyph";

const DELIVERY: Record<string, string> = { RECORDED: "Recorded", LIVE: "Live", HYBRID: "Live + Recorded" };

export function CourseThumb({ title, categorySlug, accent, src }: { title: string; categorySlug: string; accent: string; src?: string | null }) {
  return (
    <div className="relative aspect-[16/10] overflow-hidden rounded-xl bg-navy-900">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="size-full object-cover" loading="lazy" decoding="async" />
      ) : (
        <>
          <div className="absolute inset-0 bg-blueprint opacity-60" />
          <div className="absolute inset-0" style={{ background: `radial-gradient(120% 90% at 85% 15%, ${accent}55, transparent 60%), linear-gradient(160deg, #0b1324, #05080f)` }} />
          <CategoryGlyph slug={categorySlug} className="absolute -bottom-3 -right-3 size-32 opacity-90" color={accent} />
          <span className="absolute left-3 top-3 font-mono text-[10px] tracking-[0.2em] text-white/70">{categorySlug.toUpperCase()}</span>
          <span className="sr-only">{title}</span>
        </>
      )}
    </div>
  );
}

export function CourseCard({ c }: { c: CourseCardData }) {
  return (
    <Link href={`/courses/${c.slug}`} className="group glass flex flex-col overflow-hidden rounded-2xl p-3 transition duration-300 hover:-translate-y-1 hover:shadow-[0_24px_50px_-24px_var(--brand)]">
      <CourseThumb title={c.title} categorySlug={c.category_slug} accent={c.accent} src={c.thumbnail_url} />
      <div className="flex flex-1 flex-col px-1.5 pb-1.5 pt-3.5">
        <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[11px] font-medium text-muted">
          <span style={{ color: c.accent }}>{c.category_name}</span>
          <span aria-hidden="true">·</span><span>{DELIVERY[c.delivery] ?? c.delivery}</span>
          <span aria-hidden="true">·</span><span className="capitalize">{c.level.toLowerCase()}</span>
        </div>
        <h3 className="font-display text-[15px] font-semibold leading-snug tracking-tight group-hover:text-brand-strong">{c.title}</h3>
        <p className="mt-1.5 line-clamp-2 text-sm text-muted">{c.subtitle}</p>
        <div className="mt-auto flex items-end justify-between pt-4">
          <span className="text-xs text-muted">{c.lesson_count} lessons · {c.estimated_hours}h</span>
          <span className="text-right">
            {c.compare_at_price_paise && !c.is_free ? <span className="mr-1.5 text-xs text-muted line-through">{formatMoney(c.compare_at_price_paise)}</span> : null}
            <span className={c.is_free ? "font-semibold text-ok" : "font-display font-semibold"}>{c.is_free ? "Free" : formatMoney(c.price_paise, c.currency)}</span>
          </span>
        </div>
        {c.is_demo && <span className="mt-2 self-start rounded-md bg-surface-2 px-1.5 py-0.5 font-mono text-[9px] tracking-widest text-muted">DEMO CONTENT</span>}
      </div>
    </Link>
  );
}
