import { env } from "@/lib/env";

/**
 * Fixed-window rate limiter.
 *  - Default: in-memory (per server instance) — fine for dev and single-instance hosting.
 *  - Set UPSTASH_REDIS_REST_URL/TOKEN for a shared limit across serverless instances.
 */
type Bucket = { count: number; reset: number };
const memory = new Map<string, Bucket>();

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  resetSeconds: number;
}

export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
  const { UPSTASH_REDIS_REST_URL: url, UPSTASH_REDIS_REST_TOKEN: token } = env();
  if (url && token) {
    try {
      const k = `rl:${key}:${Math.floor(Date.now() / 1000 / windowSeconds)}`;
      const res = await fetch(`${url}/pipeline`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify([["INCR", k], ["EXPIRE", k, String(windowSeconds)]]),
        cache: "no-store",
      });
      const [[, count]] = (await res.json()).map((r: { result: number }) => [null, r.result]);
      return { ok: count <= limit, remaining: Math.max(0, limit - count), resetSeconds: windowSeconds };
    } catch {
      // fall through to memory limiter if Redis is unreachable
    }
  }
  const now = Date.now();
  let b = memory.get(key);
  if (!b || b.reset <= now) {
    b = { count: 0, reset: now + windowSeconds * 1000 };
    memory.set(key, b);
  }
  b.count++;
  if (memory.size > 50_000) {
    for (const [k, v] of memory) if (v.reset <= now) memory.delete(k);
  }
  return { ok: b.count <= limit, remaining: Math.max(0, limit - b.count), resetSeconds: Math.ceil((b.reset - now) / 1000) };
}

export function clientIp(headers: Headers): string {
  return (headers.get("x-forwarded-for")?.split(",")[0] || headers.get("x-real-ip") || "unknown").trim();
}

export const LIMITS = {
  login: [10, 300],
  register: [5, 3600],
  passwordReset: [5, 3600],
  contact: [5, 3600],
  checkout: [20, 600],
  api: [120, 60],
  webhook: [300, 60],
  liveChat: [30, 60],
} as const satisfies Record<string, readonly [number, number]>;
