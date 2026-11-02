import postgres from "postgres";
import { env } from "@/lib/env";

export type Sql = postgres.Sql<Record<string, unknown>>;
export type Tx = postgres.TransactionSql<Record<string, unknown>>;

declare global {
  // eslint-disable-next-line no-var
  var __tierraSql: Sql | undefined;
}

/**
 * Single pooled connection per server instance.
 * `prepare: false` keeps us compatible with Supabase's transaction pooler (Supavisor/PgBouncer).
 */
export function sql(): Sql {
  if (!globalThis.__tierraSql) {
    const e = env();
    globalThis.__tierraSql = postgres(e.DATABASE_URL, {
      max: e.DB_POOL_MAX,
      prepare: false,
      idle_timeout: 20,
      connect_timeout: 10,
      ssl: /sslmode=require|supabase\.(co|com)/.test(e.DATABASE_URL) ? "require" : undefined,
      transform: { undefined: null },
      onnotice: () => {},
    }) as Sql;
  }
  return globalThis.__tierraSql;
}

export interface DbActor {
  id: string;
  email?: string;
}

/**
 * Run queries AS THE USER: switches to the `authenticated` role and sets JWT claims
 * so PostgreSQL Row Level Security policies are enforced on every statement.
 * Pass `null` to run as `anon` (public visitor).
 */
export async function asUser<T>(actor: DbActor | null, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return sql().begin(async (tx) => {
    const claims = actor
      ? JSON.stringify({ sub: actor.id, email: actor.email ?? null, role: "authenticated" })
      : JSON.stringify({ role: "anon" });
    await tx.unsafe(actor ? "set local role authenticated" : "set local role anon");
    await tx`select set_config('request.jwt.claims', ${claims}, true)`;
    return fn(tx);
  }) as Promise<T>;
}

/**
 * Run queries with SERVICE privileges (bypasses RLS). Only call from server code
 * AFTER an explicit authorization check (or for system events such as verified webhooks).
 */
export async function asService<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return sql().begin(fn) as Promise<T>;
}

export function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "23505";
}

export function isPermissionError(e: unknown): boolean {
  const code = (e as { code?: string })?.code;
  return code === "42501";
}
