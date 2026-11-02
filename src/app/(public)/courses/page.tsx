import type { Metadata } from "next";
import { listCategories, listCourses, type CatalogFilters } from "@/lib/services/catalog";
import { CourseCard } from "@/components/public/CourseCard";
import { Pagination, pageParam, strParam } from "@/components/ui/data";
import { EmptyState, Input, PageHeader, Select, buttonClass } from "@/components/ui/primitives";
import Link from "next/link";

export const metadata: Metadata = { title: "Courses", description: "Browse free and paid engineering courses — live, recorded and hybrid." };

type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function CoursesPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const f: CatalogFilters = {
    q: strParam(sp.q), category: strParam(sp.category),
    price: strParam(sp.price) as CatalogFilters["price"], delivery: strParam(sp.delivery) as CatalogFilters["delivery"],
    level: strParam(sp.level) as CatalogFilters["level"], sort: strParam(sp.sort) as CatalogFilters["sort"], page: pageParam(sp.page),
  };
  const valid = (v: string | undefined, allowed: string[]) => (v && allowed.includes(v) ? v : undefined);
  f.price = valid(f.price, ["free", "paid"]) as CatalogFilters["price"];
  f.delivery = valid(f.delivery, ["RECORDED", "LIVE", "HYBRID"]) as CatalogFilters["delivery"];
  f.level = valid(f.level, ["BEGINNER", "INTERMEDIATE", "ADVANCED"]) as CatalogFilters["level"];
  f.sort = valid(f.sort, ["newest", "price_asc", "price_desc", "title"]) as CatalogFilters["sort"];
  const [cats, res] = await Promise.all([listCategories(), listCourses(f)]);
  const active = cats.find((c) => c.slug === f.category);

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
      <PageHeader eyebrow="Course catalogue" title={active ? `${active.name} courses` : "All courses"}
        description={active ? (active.description as string) : "Hands-on engineering courses — free and paid, live and recorded. Filter by discipline, level and format."} />
      <nav aria-label="Disciplines" className="mb-5 flex flex-wrap gap-2">
        <Link href="/courses" className={buttonClass(!f.category ? "primary" : "outline", "sm")}>All</Link>
        {cats.map((c) => (
          <Link key={c.id as string} href={`/courses?category=${c.slug}`} className={buttonClass(f.category === c.slug ? "primary" : "outline", "sm")} aria-current={f.category === c.slug ? "page" : undefined}>
            {c.name as string} <span className="opacity-60">{c.course_count as number}</span>
          </Link>
        ))}
      </nav>
      <form method="get" role="search" className="glass mb-8 grid gap-3 rounded-2xl p-3 sm:grid-cols-2 lg:grid-cols-[2fr_repeat(4,1fr)_auto]">
        {f.category && <input type="hidden" name="category" value={f.category} />}
        <label className="sr-only" htmlFor="q">Search</label>
        <Input id="q" name="q" defaultValue={f.q} placeholder="Search courses…" />
        <label className="sr-only" htmlFor="price">Price</label>
        <Select id="price" name="price" defaultValue={f.price ?? ""}><option value="">Any price</option><option value="free">Free</option><option value="paid">Paid</option></Select>
        <label className="sr-only" htmlFor="delivery">Format</label>
        <Select id="delivery" name="delivery" defaultValue={f.delivery ?? ""}><option value="">Any format</option><option value="RECORDED">Recorded</option><option value="LIVE">Live</option><option value="HYBRID">Hybrid</option></Select>
        <label className="sr-only" htmlFor="level">Level</label>
        <Select id="level" name="level" defaultValue={f.level ?? ""}><option value="">Any level</option><option value="BEGINNER">Beginner</option><option value="INTERMEDIATE">Intermediate</option><option value="ADVANCED">Advanced</option></Select>
        <label className="sr-only" htmlFor="sort">Sort</label>
        <Select id="sort" name="sort" defaultValue={f.sort ?? ""}><option value="">Relevance / newest</option><option value="price_asc">Price: low → high</option><option value="price_desc">Price: high → low</option><option value="title">Title A–Z</option></Select>
        <button className={buttonClass("primary", "md")} type="submit">Filter</button>
      </form>
      <p className="mb-4 text-sm text-muted" aria-live="polite">{res.total} course{res.total === 1 ? "" : "s"} found</p>
      {res.items.length ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{res.items.map((c) => <CourseCard key={c.id} c={c} />)}</div>
      ) : (
        <EmptyState icon="search" title="No courses match these filters" description="Try removing a filter or searching for something broader." action={<Link className={buttonClass("outline", "sm")} href="/courses">Clear filters</Link>} />
      )}
      <Pagination page={res.page} pages={res.pages} basePath="/courses" params={{ q: f.q, category: f.category, price: f.price, delivery: f.delivery, level: f.level, sort: f.sort }} />
    </div>
  );
}
