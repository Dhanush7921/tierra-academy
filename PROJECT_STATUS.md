# PROJECT_STATUS — Tierra Academy

_Last updated: 3 Nov 2026_

## Summary

The application code, database, security model, tests and documentation are **complete for a demonstration deployment**. External production services (Razorpay, Zoom, Cloudflare Stream, Resend, Supabase project, Vercel, GitHub repository) still need credentials or accounts. Each has a working adapter plus a clearly labelled demo mode.

## Completed

- [x] Reference analysis (`design-references/`): frames extracted with FFmpeg; original engineering-themed design (no farm/egg concepts, no copied assets)
- [x] Design system: dark navy + gradient-white themes, persistent theme switch (cookie, no flash), reduced-motion mode (OS + in-app toggle), glass components, original logo preserved
- [x] Cinematic homepage, scenes 1–12:
  - ESP32 self-assembly with illuminating copper-trace shader and skip button
  - Scroll-driven campus with six interactive stations (Electronics PCB, Robotics arm, IoT network + live dashboard, Embedded MCU + UART/I²C/SPI/CAN buses, Electrical motor + current flow, Mechanical gear train + exploded assembly)
  - Learning options, course discovery, process trace and brand-reveal CTA
  - Mobile, reduced-motion and no-WebGL fallbacks
- [x] Public pages: catalogue (search, filters, sort, pagination), course detail, categories, live schedule, instructors, about, FAQ, contact (rate-limited + honeypot), Terms, Privacy, Refund (marked draft), certificate verification, 404, robots, sitemap
- [x] Auth: local (scrypt) / Supabase adapter, sessions with revocation, password reset, lockout, TOTP MFA, one-time Super Admin provisioning (`/setup` + CLI)
- [x] RBAC + RLS on every table + column guard triggers
- [x] Student panel: 3D lab dashboard with accessible labels, widgets, lesson player (signed URLs, resume, speed, captions, anti-skip completion), live classroom, quizzes (server-graded, answer keys hidden), assignments (validated uploads), resources, certificates (PDF), payments + refund requests, notifications, profile, data export and deletion requests
- [x] Admin panel:
  - overview with real-query KPIs and charts (revenue for Super Admin only)
  - course editor (details, curriculum, media upload, assessments, pricing for SA, team assignment, review history, analytics)
  - approvals (publish/revisions/live)
  - live (propose/approve/start/end, attendance, recordings)
  - media library, grading, invitations (email/link/WhatsApp, complimentary for SA only), analytics
  - users (disable, enrol, privacy requests), content team, orders/refunds, coupons, certificates (revoke/re-evaluate), email outbox, audit log, settings with integration status
- [x] Payments: Razorpay orders/checkout/verify/webhooks/refunds + DEMO simulator through the same verified, idempotent pipeline; coupons
- [x] Live: Zoom S2S + Meeting SDK adapter, webhooks, attendance import, reminders cron; DEMO classroom
- [x] Video: Cloudflare Stream direct upload/status/webhook/signed playback; local dev provider with Range streaming; synthetic demo clips
- [x] Email outbox + Resend adapter; notifications
- [x] Migrations, seed (labelled demo content), provisioning script, CI workflow, docs

## Verification performed (in the build sandbox)

| Check | Result |
|---|---|
| Database policy + workflow tests (real PostgreSQL 16) | **38/38 pass** |
| Unit tests (JWT, TOTP RFC vector, crypto, RBAC, pricing, eligibility, uploads, signatures, formatting) | **24/24 pass** |
| TypeScript (strict) over all source, scripts and tests | **0 errors**, using real React/Three/GSAP types and stubs for the Next.js APIs used |
| All 60+ page routes rendered through a server-rendering harness with the real components and DB, as anonymous, student, Content Manager and Super Admin | All render; role gates redirect correctly |
| API routes over HTTP (playback, signed Range media, captions, progress, CSRF, webhooks, RBAC, cron auth, export) | Behave as designed (one bug found and fixed: Razorpay webhook returned 500 instead of 400 when unconfigured) |
| 3D scenes rendered in headless Chromium (software WebGL) | Hero, world (all six stations) and lab verified visually |
| Load test (harness, worst case, no caching) | 0% failures at 50/100/250/500 concurrency; see docs/LOAD_TESTING.md |

## Blocked / not yet executed

| Item | Why | What's needed |
|---|---|---|
| `npm install`, `next build`, ESLint, Vitest, Playwright E2E run under the real toolchain | The build sandbox had no access to the npm registry | Run `npm install && npm run typecheck && npm run lint && npm test && npm run build && npm run test:e2e` locally or in CI (workflow included) |
| GitHub repository push | No valid GitHub credentials in the sandbox | Create a private repo `tierra-academy`, `git remote add origin …`, `git push -u origin main` |
| Vercel preview deployment | No Vercel access | See docs/DEPLOYMENT.md |
| Supabase project | Not created (would create billable cloud resources) | See docs/DEPLOYMENT.md |
| Razorpay / Zoom / Cloudflare / Resend live integrations | Credentials pending CEO approval | See docs/DEPLOYMENT.md §3. These adapters are implemented but **not tested against the real services** |
| Production-scale load test | Needs a deployed preview | docs/LOAD_TESTING.md |

## Known limitations / next steps

- Zoom in-browser join (Component View) is implemented per the SDK documentation but unverified without credentials; the external join link is the fallback.
- Cloudflare Stream playback uses Stream's iframe player plus its Player SDK for progress events; unverified without an account.
- Policy texts are starter templates; they need legal review.
- Instructor profiles, course syllabi and prices are labelled demo placeholders.
- Supabase-mode MFA uses the app-level TOTP (works with either auth provider); Supabase's own MFA is not used.
