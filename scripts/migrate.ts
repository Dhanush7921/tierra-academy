/**
 * Applies SQL migrations in supabase/migrations (in filename order) and records them.
 *   npm run db:migrate            apply pending migrations
 *   npm run db:migrate -- --reset DROP and recreate the public schema (local dev only!)
 *
 * On Supabase you may instead run `supabase db push` — the files are Supabase-CLI compatible.
 * The local auth shim (db/local-supabase-shim.sql) is applied only when DB_IS_SUPABASE != "true".
 */
import postgres from "postgres";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const url = process.env.DATABASE_URL || "postgres://tierra:tierra_dev@127.0.0.1:5432/tierra_academy";
const isSupabase = process.env.DB_IS_SUPABASE === "true";
const reset = process.argv.includes("--reset");
const root = path.resolve(__dirname, "..");

export async function migrate(databaseUrl = url, opts: { reset?: boolean; quiet?: boolean } = {}) {
  const sql = postgres(databaseUrl, { max: 1, onnotice: () => {}, prepare: false });
  const log = (...a: unknown[]) => !opts.quiet && console.log(...a);
  try {
    if (opts.reset) {
      if (process.env.NODE_ENV === "production" || isSupabase) throw new Error("Refusing to reset a production/Supabase database");
      log("⚠  resetting public schema");
      await sql.unsafe("drop schema if exists public cascade; create schema public; grant usage on schema public to public;");
      await sql.unsafe("do $$ begin if to_regclass('auth.users') is not null then delete from auth.users; end if; end $$;");
    }
    if (!isSupabase) {
      await sql.unsafe(readFileSync(path.join(root, "db/local-supabase-shim.sql"), "utf8"));
      log("✓ local Supabase shim");
    }
    await sql.unsafe(`create table if not exists public.schema_migrations (
      name text primary key, applied_at timestamptz not null default now())`);
    const done = new Set((await sql`select name from public.schema_migrations`).map((r) => r.name as string));
    const dir = path.join(root, "supabase/migrations");
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
      if (done.has(file)) continue;
      await sql.begin(async (tx) => {
        await tx.unsafe(readFileSync(path.join(dir, file), "utf8"));
        await tx`insert into public.schema_migrations (name) values (${file})`;
      });
      log("✓", file);
    }
    // schema_migrations itself must not be readable by API roles
    await sql.unsafe("alter table public.schema_migrations enable row level security; revoke all on public.schema_migrations from anon, authenticated;");
  } finally {
    await sql.end();
  }
}

if (require.main === module) {
  migrate(url, { reset }).then(
    () => console.log("migrations complete"),
    (e) => {
      console.error(e);
      process.exit(1);
    },
  );
}
