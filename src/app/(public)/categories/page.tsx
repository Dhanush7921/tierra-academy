import type { Metadata } from "next";
import Link from "next/link";
import { listCategories } from "@/lib/services/catalog";
import { PageHeader } from "@/components/ui/primitives";
import { CategoryGlyph } from "@/components/public/CategoryGlyph";

export const metadata: Metadata = { title: "Disciplines" };
export const revalidate = 300;

export default async function CategoriesPage() {
  const cats = await listCategories();
  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
      <PageHeader eyebrow="Disciplines" title="Six engineering disciplines" description="Every Tierra Academy course belongs to one of six hands-on disciplines." />
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {cats.map((c) => (
          <Link key={c.id as string} href={`/categories/${c.slug}`} className="group glass relative overflow-hidden rounded-3xl p-7 transition hover:-translate-y-1">
            <div className="absolute -right-12 -top-12 size-48 rounded-full opacity-25 blur-3xl transition group-hover:opacity-50" style={{ background: c.accent as string }} />
            <CategoryGlyph slug={c.slug as string} color={c.accent as string} className="size-16" />
            <h2 className="mt-5 font-display text-xl font-semibold">{c.name as string}</h2>
            <p className="label-mono mt-1" style={{ color: c.accent as string }}>{c.tagline as string}</p>
            <p className="mt-3 text-sm text-fg-2">{c.description as string}</p>
            <p className="mt-5 text-sm font-semibold">{c.course_count as number} courses →</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
