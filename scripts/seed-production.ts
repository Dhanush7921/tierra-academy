/**
 * Production catalogue seed (idempotent). Creates the six paid Tierra Academy courses and their
 * initial duration fees. No demo users, sample students, ratings, transactions or certificates.
 *
 *   DATABASE_URL=... npm run db:seed:production
 *
 * Existing courses/prices are never overwritten: once a Super Admin edits a fee in the Admin
 * Panel, re-running this script leaves it alone. Fees are INR paise, excluding tax.
 * Syllabus, outcomes, images and instructors are left empty for the academy team to fill in.
 */
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL is required"); process.exit(1); }

const STD = [{ label: "1 Month", days: 30, paise: 300000 }, { label: "45 Days", days: 45, paise: 450000 }];
// Robotics 45-day fee is not confirmed yet: only the 1-month option is created.
const ROBOTICS = [{ label: "1 Month", days: 30, paise: 600000 }];

const COURSES = [
  { slug: "embedded-systems", title: "Embedded Systems", cat: "embedded", accent: "#9BE15D", options: STD },
  { slug: "internet-of-things", title: "Internet of Things (IoT)", cat: "iot", accent: "#38D2FF", options: STD },
  { slug: "full-stack-web-development", title: "Full Stack Web Development", cat: "web-development", accent: "#FFB300", options: STD },
  { slug: "app-development", title: "App Development", cat: "app-development", accent: "#FF7A1A", options: STD },
  { slug: "robotics", title: "Robotics", cat: "robotics", accent: "#FF5A1F", options: ROBOTICS },
  { slug: "prompt-engineering", title: "Prompt Engineering", cat: "prompt-engineering", accent: "#C9A7FF", options: STD },
];

async function main() {
const sql = postgres(url!, { max: 1, prepare: false, onnotice: () => {} });
try {
  await sql.begin(async (tx) => {
    for (const [i, c] of COURSES.entries()) {
      const [cat] = await tx`insert into public.course_categories (slug, name, accent, sort_order)
        values (${c.cat}, ${c.title}, ${c.accent}, ${i}) on conflict (slug) do update set sort_order = excluded.sort_order returning id`;
      const description = `${c.title} training by Tierra Automation. The detailed syllabus, schedule and instructor details will be published by the academy team.`;
      const [course] = await tx`insert into public.courses (slug, title, description, category_id, delivery, is_free, price_paise, status, published_at, certificate_enabled)
        values (${c.slug}, ${c.title}, ${description}, ${cat.id}, 'HYBRID', false, ${c.options[0].paise}, 'PUBLISHED', now(), true)
        on conflict (slug) do nothing returning id`;
      if (!course) { console.log(`= ${c.slug} exists, left unchanged`); continue; }
      for (const [j, o] of c.options.entries()) {
        await tx`insert into public.course_price_options (course_id, label, duration_days, price_paise, sort_order)
          values (${course.id}, ${o.label}, ${o.days}, ${o.paise}, ${j})`;
      }
      console.log(`+ ${c.slug}`);
    }
  });
} finally {
  await sql.end();
}
}

main().catch((e) => { console.error(e); process.exit(1); });
