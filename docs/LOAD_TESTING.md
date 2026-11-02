# Load testing

## Scripts

- `load/k6/public-browse.js`: anonymous catalogue browsing (`VUS=50|100|250|500`). Thresholds: p95 < 800 ms, < 1% failures.
- `load/k6/student-session.js`: signed-in students opening the dashboard, requesting playback tokens and sending progress heartbeats.
- `load/node-load.ts`: dependency-free generator (p50/p95/p99, RPS, failure rate) for 50/100/250/500 concurrent clients.

**Do not run against production or a shared Supabase project without authorisation.** Use a dedicated preview deployment and test database.

## Measured so far (honest baseline)

Environment: the build sandbox, with 2 vCPU and Postgres 16 on the same machine. Next.js could not be installed there (no npm registry access), so the pages were rendered by a **verification harness**. It uses the same React Server Components, services and SQL, but runs as a single Node process **without** Next.js ISR/`unstable_cache` (every request hits the DB and re-renders). That makes this a worst case.

| Concurrent clients | Requests (10 s) | Throughput | p50 | p95 | p99 | Failures |
|---|---|---|---|---|---|---|
| 50 | 1,408 | 141 req/s | 338 ms | 530 ms | 668 ms | 0% |
| 100 | 1,531 | 153 req/s | 688 ms | 786 ms | 828 ms | 0% |
| 250 | 1,655 | 166 req/s | 1,686 ms | 1,969 ms | 2,152 ms | 0% |
| 500 | 1,927 | 193 req/s | 3,112 ms | 3,554 ms | 3,974 ms | 0% |

Mix: `/courses`, `/courses?category=iot`, `/courses/iot-with-esp32`, `/live`, `/api/health`.

Database timings under RLS (`EXPLAIN ANALYZE`): full-text catalogue search **~3 ms**, a student's enrollments **< 0.1 ms**.

### Interpretation

- The bottleneck is **CPU-bound server rendering in one process**, not the database. No errors were seen up to 500 concurrent clients; latency grows linearly once throughput saturates at about 150–190 req/s.
- In production, public pages are served from Next.js ISR / Vercel's CDN (`revalidate = 60`). Most anonymous traffic never reaches the renderer or the database, and Vercel scales function instances horizontally.
- Video traffic is served by Cloudflare Stream, not the app.

### Not yet proven

These numbers do **not** demonstrate 20,000 *simultaneous* users. 20,000 *registered* accounts is a modest data volume for this schema (indexed, paginated). To size real concurrency:

1. Deploy a preview with Supabase (pooler) + Vercel.
2. Run `public-browse.js` at 50 → 100 → 250 → 500 VUs and `student-session.js` at 50 → 250 VUs with test accounts.
3. Watch Supabase CPU, connection count (`DB_POOL_MAX` × instances ≤ pooler limit), p95 and error rate.
4. Record the results here.
