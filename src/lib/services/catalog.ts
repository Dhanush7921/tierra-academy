import { unstable_cache } from "next/cache";
import { asUser, type DbActor } from "@/lib/db/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

/** Public catalogue queries — run as `anon` (or the user) so RLS decides visibility. */
export interface CourseCardData {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  thumbnail_url: string | null;
  category_slug: string;
  category_name: string;
  accent: string;
  level: string;
  delivery: string;
  is_free: boolean;
  price_paise: number;
  compare_at_price_paise: number | null;
  currency: string;
  estimated_hours: number;
  lesson_count: number;
  instructor_name: string | null;
  is_demo: boolean;
}

export interface CatalogFilters {
  q?: string;
  category?: string;
  price?: "free" | "paid";
  delivery?: "RECORDED" | "LIVE" | "HYBRID";
  level?: "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
  sort?: "newest" | "price_asc" | "price_desc" | "title";
  page?: number;
  pageSize?: number;
}

export const PAGE_SIZE = 12;

async function queryCatalog(f: CatalogFilters, actor: DbActor | null) {
  const pageSize = Math.min(f.pageSize ?? PAGE_SIZE, 48);
  const page = Math.max(1, f.page ?? 1);
  const q = f.q?.trim().slice(0, 100) || null;
  return asUser(actor, async (tx) => {
    const where = tx`
      c.status = 'PUBLISHED'
      ${f.category ? tx`and cat.slug = ${f.category}` : tx``}
      ${f.price === "free" ? tx`and c.is_free` : f.price === "paid" ? tx`and not c.is_free` : tx``}
      ${f.delivery ? tx`and c.delivery = ${f.delivery}` : tx``}
      ${f.level ? tx`and c.level = ${f.level}` : tx``}
      ${q ? tx`and (c.search_vector @@ websearch_to_tsquery('english', ${q}) or c.title ilike ${"%" + q + "%"})` : tx``}`;
    const order =
      f.sort === "price_asc" ? tx`c.price_paise asc, c.title` :
      f.sort === "price_desc" ? tx`c.price_paise desc, c.title` :
      f.sort === "title" ? tx`c.title asc` :
      q ? tx`ts_rank(c.search_vector, websearch_to_tsquery('english', ${q})) desc, c.published_at desc` : tx`c.published_at desc nulls last`;
    const rows = await tx`
      select c.id, c.slug, c.title, c.subtitle, c.thumbnail_url, cat.slug as category_slug, cat.name as category_name, cat.accent,
             c.level, c.delivery, c.is_free, c.price_paise, c.compare_at_price_paise, c.currency, c.estimated_hours::float as estimated_hours,
             (select count(*) from public.course_outline(c.id) o where o.lesson_id is not null)::int as lesson_count,
             i.display_name as instructor_name, c.is_demo, count(*) over()::int as total
      from public.courses c
      join public.course_categories cat on cat.id = c.category_id
      left join public.instructor_profiles i on i.id = c.instructor_id
      where ${where}
      order by ${order}
      limit ${pageSize} offset ${(page - 1) * pageSize}`;
    const total = (rows[0]?.total as number) ?? 0;
    return { items: rows as unknown as CourseCardData[], total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) };
  });
}

/** Anonymous catalogue results are cached for 60 s (tag: "catalog"). */
export const listCourses = (f: CatalogFilters) =>
  unstable_cache(() => queryCatalog(f, null), ["catalog", JSON.stringify(f)], { revalidate: 60, tags: ["catalog"] })();

export const listCategories = unstable_cache(
  (): Promise<Row[]> => asUser(null, (tx) => tx`
    select cat.*, (select count(*) from public.courses c where c.category_id = cat.id and c.status = 'PUBLISHED')::int as course_count
    from public.course_categories cat order by sort_order`),
  ["categories"], { revalidate: 300, tags: ["catalog"] },
);

export async function getCourseBySlug(slug: string, actor: DbActor | null) {
  return asUser(actor, async (tx) => {
    const [c] = await tx`
      select c.*, c.estimated_hours::float as estimated_hours, cat.slug as category_slug, cat.name as category_name, cat.accent,
             i.display_name as instructor_name, i.headline as instructor_headline, i.bio as instructor_bio, i.is_demo as instructor_is_demo,
             i.avatar_url as instructor_avatar
      from public.courses c join public.course_categories cat on cat.id = c.category_id
      left join public.instructor_profiles i on i.id = c.instructor_id
      where c.slug = ${slug}`;
    if (!c) return null;
    const outline = await tx`select * from public.course_outline(${c.id})`;
    const sessions = await tx`select id, title, starts_at, duration_minutes, status from public.live_sessions
                              where course_id = ${c.id} and status in ('SCHEDULED','LIVE') and starts_at > now() - interval '2 hours'
                              order by starts_at limit 6`;
    const enrollment = actor
      ? (await tx`select status, progress_percent::float as progress from public.enrollments where course_id = ${c.id} and user_id = ${actor.id}`)[0] ?? null
      : null;
    const options = await tx`select id, label, duration_days, price_paise from public.course_price_options
                             where course_id = ${c.id} and is_active order by sort_order, price_paise`;
    return { course: c, outline, sessions, enrollment, options };
  });
}

export const listUpcomingSessions = unstable_cache(
  (): Promise<Row[]> => asUser(null, (tx) => tx`
    select s.id, s.title, s.description, s.starts_at, s.duration_minutes, s.status, s.is_demo, c.title as course_title, c.slug as course_slug,
           cat.name as category_name, cat.accent
    from public.live_sessions s join public.courses c on c.id = s.course_id join public.course_categories cat on cat.id = c.category_id
    where s.status in ('SCHEDULED','LIVE') and s.starts_at > now() - interval '1 hour'
    order by s.starts_at limit 24`),
  ["upcoming-sessions"], { revalidate: 60, tags: ["catalog", "live"] },
);

export const listInstructors = unstable_cache(
  (): Promise<Row[]> => asUser(null, (tx) => tx`
    select i.*, (select count(*) from public.courses c where c.instructor_id = i.id and c.status = 'PUBLISHED')::int as course_count
    from public.instructor_profiles i where i.is_public order by i.display_name`),
  ["instructors"], { revalidate: 300, tags: ["catalog"] },
);
