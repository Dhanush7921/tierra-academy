/**
 * DB test harness. Uses DATABASE_URL_TEST (a disposable database!) — it is reset before each file.
 *   createdb tierra_test && DATABASE_URL_TEST=postgres://.../tierra_test npm run test:db
 */
import postgres from "postgres";

export const TEST_DB = process.env.DATABASE_URL_TEST || "postgres://tierra:tierra_dev@127.0.0.1:5432/tierra_test";
process.env.DATABASE_URL = TEST_DB;
process.env.DEMO_USER_PASSWORD = process.env.DEMO_USER_PASSWORD || `Local-${crypto.randomUUID()}#1`;
process.env.PAYMENTS_PROVIDER = "demo";
process.env.APP_MODE = "demo";
process.env.SESSION_SECRET = "test-session-secret-0123456789abcdefghijklmnop";

export async function resetDb() {
  const { migrate } = await import("../../scripts/migrate");
  const { seed } = await import("../../scripts/seed");
  await migrate(TEST_DB, { reset: true, quiet: true });
  await seed(TEST_DB, { quiet: true });
  // Checkout requires a confirmed tax setup; 0% keeps the amount assertions in paise exact.
  const db = postgres(TEST_DB, { max: 1, onnotice: () => {} });
  await db`insert into public.platform_settings (key, value) values ('tax', ${db.json({ label: "Tax", rateBp: 0, configured: true })})
    on conflict (key) do update set value = excluded.value`;
  await db.end();
}

export const admin = postgres(TEST_DB, { max: 2, onnotice: () => {} });

export async function userByEmail(email: string) {
  const [u] = await admin`select p.id, p.email, coalesce(array_agg(r.role::text), '{}') as roles
                          from public.profiles p left join public.user_roles r on r.user_id = p.id
                          where p.email = ${email} group by p.id`;
  return { id: u.id as string, email: u.email as string, roles: u.roles as string[], fullName: email };
}

export const course = async (slug: string) => (await admin`select * from public.courses where slug = ${slug}`)[0];

/** Runs a single statement as a given user (or anon) with RLS active; returns rows or the PG error code. */
export async function as<T = Record<string, unknown>>(userId: string | null, query: string, params: unknown[] = []): Promise<{ rows: T[]; error?: string }> {
  try {
    const rows = await admin.begin(async (tx) => {
      await tx.unsafe(userId ? "set local role authenticated" : "set local role anon");
      await tx.unsafe(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(userId ? { sub: userId, role: "authenticated" } : { role: "anon" })]);
      return tx.unsafe(query, params as never[]);
    });
    return { rows: rows as unknown as T[] };
  } catch (e) {
    return { rows: [], error: (e as { code?: string }).code ?? String(e) };
  }
}

export async function closeAll() {
  await admin.end();
  const { sql } = await import("../../src/lib/db/client");
  await sql().end();
}
