/**
 * Dependency-free load generator (when k6 isn't installed).
 *   npx tsx load/node-load.ts --url http://localhost:3000 --paths /,/courses,/courses/iot-with-esp32 --levels 50,100,250,500 --seconds 20
 * Reports throughput, p50/p95/p99 latency and failure rate per concurrency level.
 * Do NOT point this at production without authorisation.
 */
const arg = (k: string, d: string) => { const i = process.argv.indexOf(`--${k}`); return i > -1 ? process.argv[i + 1] : d; };
const BASE = arg("url", "http://localhost:3000");
const PATHS = arg("paths", "/,/courses,/courses?category=iot,/courses/iot-with-esp32,/live").split(",");
const LEVELS = arg("levels", "50,100,250,500").split(",").map(Number);
const SECONDS = Number(arg("seconds", "20"));
const COOKIE = arg("cookie", "");

async function level(concurrency: number) {
  const lat: number[] = [];
  let fail = 0, n = 0;
  const end = Date.now() + SECONDS * 1000;
  await Promise.all(Array.from({ length: concurrency }, async (_, w) => {
    let i = w;
    while (Date.now() < end) {
      const t = performance.now();
      try {
        const r = await fetch(BASE + PATHS[i++ % PATHS.length], { headers: COOKIE ? { Cookie: COOKIE } : {}, redirect: "manual" });
        await r.arrayBuffer();
        if (r.status >= 400) fail++;
      } catch { fail++; }
      lat.push(performance.now() - t);
      n++;
    }
  }));
  lat.sort((a, b) => a - b);
  const p = (q: number) => lat[Math.min(lat.length - 1, Math.floor(lat.length * q))]?.toFixed(0);
  return { concurrency, requests: n, rps: (n / SECONDS).toFixed(1), p50: p(0.5), p95: p(0.95), p99: p(0.99), failRate: `${((fail / Math.max(1, n)) * 100).toFixed(2)}%` };
}

(async () => {
  const rows = [];
  for (const c of LEVELS) { rows.push(await level(c)); console.log(rows[rows.length - 1]); }
  console.table(rows);
})();
