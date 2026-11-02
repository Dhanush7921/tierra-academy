# Architecture

## Request flow

```
Browser ──► Edge middleware (session signature check, x-pathname, no-store on private areas)
        ──► Server Component / Server Action / Route Handler
              ├─ requireUser / requireStaff / requirePermission   (roles re-read from DB on every request)
              ├─ asUser(user, tx => …)   SET LOCAL ROLE authenticated + JWT claims → PostgreSQL RLS enforced
              └─ asService(tx => …)      table-owner privileges, ONLY after an explicit check
                                          (verified webhooks, enrollment after payment, certificate issuance, audit)
```

Authorization is enforced at three layers. Hiding UI is never the only control.
1. **Application RBAC** (`src/lib/rbac.ts`): a permission matrix checked by every admin page, action and API route.
2. **Row Level Security** (`supabase/migrations/…_security_rls.sql`): every table has RLS enabled. Students can't insert enrollments, read answer keys, other students' data, meeting credentials or video assets. Content Managers can see only their assigned courses.
3. **Guard triggers**: column-level rules RLS can't express.
   - Only a Super Admin can change price, publish or archive.
   - Content Managers can only move DRAFT→REVIEW.
   - Only Super Admins can create complimentary invitations.
   - Students can't grade submissions.
   - Hosts can only start or end their own approved sessions.

## Domain model (key tables)

`profiles`, `user_roles`, `content_manager_assignments`, `course_categories`, `courses`, `course_modules`, `lessons`, `lesson_resources`, `video_assets`, `content_revisions`, `approval_requests`, `live_sessions` (+ `live_session_secrets`, `attendance`, `live_session_messages`), `enrollments`, `lesson_progress`, `orders`, `payments`, `refunds`, `webhook_events`, `coupons`, `invitations` (+ `invitation_redemptions`), `quizzes`, `questions`, `quiz_attempts`, `assignments`, `submissions`, `certificates`, `notifications`, `audit_logs`, `email_outbox`, `platform_settings`, `contact_messages`, `data_requests`, `mfa_factors`, `local_credentials`.

## Workflows

- **Publishing**: DRAFT → REVIEW → (REJECTED → DRAFT/REVIEW) → APPROVED → PUBLISHED → ARCHIVED. Every decision is stored in `approval_requests` with reviewer comments.
  - Edits to live courses or lessons by Content Managers become `content_revisions`. A Super Admin applies them; only allow-listed fields can be applied.
- **Paid enrollment**:
  1. The server computes the price, with any coupon validated on the server, and creates an order.
  2. Razorpay checkout (or the demo simulator) runs.
  3. The webhook is verified with HMAC over the raw body and checked for idempotency (`webhook_events` is unique on provider+event).
  4. The amount and currency are checked against the order.
  5. The order is marked paid, the coupon is redeemed and the enrollment is created, all in one transaction.
  - The Razorpay checkout callback is also verified by HMAC and by re-fetching the payment. Both paths are idempotent.
- **Refunds**: the student requests one within the policy window. A Super Admin approves it and the provider issues the refund. On `refund.processed`, the order and payment are marked REFUNDED and the enrollment is REFUNDED (access removed).
- **Invitations**: only a SHA-256 hash of the token is stored. Invitations can be bound to an email, expire, are use-limited and revocable. Paid courses still route to checkout unless the invitation was marked complimentary by a Super Admin.
- **Progress → certificates**: "watched" seconds only accumulate during continuous playback; the server caps heartbeats and ignores bare "ended" claims. A certificate is issued when every configured requirement is met: required lessons, required quizzes passed, required assignments graded as passing, and minimum live attendance.
- **Live**: Content Managers propose sessions and Super Admins approve them, which provisions the meeting.
  - Students join only if enrolled, from 15 minutes before the start.
  - The Zoom SDK signature is generated on the server; meeting credentials live in a service-only table.
  - Attendance comes from in-app heartbeats and the Zoom participant report. Recordings follow a PENDING → READY/IMPORTED workflow.

## Provider adapters (`src/lib/providers`)

| Concern | Production adapter | Demo/dev adapter | Switch |
|---|---|---|---|
| Payments | Razorpay REST + HMAC | Server-signed simulated events through the same webhook pipeline | `PAYMENTS_PROVIDER` |
| Live | Zoom S2S OAuth + Meeting SDK (Component View) | In-browser demo classroom (local cam/mic/screen preview + real chat & attendance) | `LIVE_PROVIDER` |
| Video | Cloudflare Stream direct upload, `requireSignedURLs`, token playback, webhook | Disk storage + HMAC-signed, user-bound, expiring Range-streaming URL | `VIDEO_PROVIDER` |
| Files | Supabase Storage (service role, server-side only) | `storage/uploads` | `STORAGE_PROVIDER` |
| Email | Resend | `email_outbox` table viewable at `/admin/outbox` | `EMAIL_PROVIDER` |
| Auth | Supabase Auth (GoTrue REST) | scrypt in `local_credentials` | `AUTH_PROVIDER` |

## 3D & performance

- Three.js scenes live in `src/three/` and are **dynamically imported** after the page is interactive, so none of the 3D code is in the initial JS bundle.
- Every model is procedural: no external assets and no licensing questions.
- The renderer caps device pixel ratio, pauses when off-screen or when the tab is hidden, and frees GPU resources on unmount.
- Fallbacks:
  - No WebGL or Save-Data → a static SVG illustration in the hero.
  - Reduced motion → no assembly animation, and the world becomes a card grid.
  - Small screens → card-grid world and a tile-grid student lab.
- Public pages use ISR (`revalidate = 60`) and `unstable_cache` with the `catalog` tag; admin edits call `revalidateTag("catalog")`.

## Scaling notes (toward 20,000 registered accounts)

- Postgres: indexed foreign keys and status/time lookups, full-text GIN index for search, paginated queries everywhere, `prepare:false` for the Supabase transaction pooler, `DB_POOL_MAX` per instance.
- Video never touches the app server in production (Cloudflare Stream direct uploads and playback).
- Rate limiting is in-memory by default; set Upstash for multi-instance consistency.
- Measured numbers and limits: [LOAD_TESTING.md](LOAD_TESTING.md).
