/**
 * basePath-aware helpers. next/link and next/navigation add the basePath automatically;
 * use these for raw fetch() calls, <img src>, <video src>, cookies and absolute URLs.
 */
export const BASE_PATH = (process.env.NEXT_PUBLIC_BASE_PATH || "").replace(/\/$/, "");

export const withBase = (p: string) => (p.startsWith("http") ? p : `${BASE_PATH}${p.startsWith("/") ? p : `/${p}`}`);
export const apiPath = (p: string) => withBase(`/api${p.startsWith("/") ? p : `/${p}`}`);
export const asset = (p: string) => withBase(p);

export function absoluteUrl(p: string): string {
  const origin = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
  return `${origin}${withBase(p)}`;
}

/** Only allow same-site relative redirects (prevents open redirects via ?next=). */
export function safeNext(next: string | null | undefined, fallback = "/dashboard"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return fallback;
  return next;
}
