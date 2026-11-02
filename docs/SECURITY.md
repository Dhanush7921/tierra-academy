# Security

## Controls implemented

| Area | Implementation |
|---|---|
| Sessions | HS256 JWT in an `httpOnly`, `SameSite=Lax`, `Secure` (prod) cookie, 7 days. `session_version` in the DB lets us revoke every session (password change or reset, disable, role change, MFA enrol). |
| Passwords (local auth) | scrypt (N=16384, r=8, p=1), lockout after 8 failures for 15 min, generic errors (no account enumeration), equal-time path for unknown emails. |
| MFA | RFC 6238 TOTP. Secrets are AES-256-GCM encrypted at rest, codes can't be replayed (last step stored), and the admin panel requires aal2 once enrolled. `REQUIRE_ADMIN_MFA=true` forces enrolment. |
| Super Admin | No public route grants SUPER_ADMIN, and RLS forbids inserting that role. It can only be granted by one-time provisioning (`/setup` with a server-side token, or the CLI), serialised with an advisory lock and closed permanently once one exists. |
| Authorization | App RBAC on every page/action/API, plus RLS on every table, plus column guard triggers. Tests cover unauthorised student and Content Manager access (`tests/db/rls.test.ts`, `tests/e2e/auth-rbac.spec.ts`). |
| CSRF | Server Actions (built-in origin check), JSON APIs require a same-origin `Origin`/`Referer`, cookies are `SameSite=Lax`. |
| Webhooks | HMAC over the raw body (Razorpay, Cloudflare `time.body`, Zoom `v0`), timestamp tolerance, idempotency table, amount/currency validation. |
| Uploads | Magic-byte sniffing (never trusts the client MIME type), allow-lists, size caps, random keys, private files streamed only through authorised routes with `nosniff` + `attachment`. |
| Video | Cloudflare `requireSignedURLs` with 10-minute tokens. Locally: HMAC-signed, user-bound, expiring URLs, and the signed-in user must match. |
| Rate limiting | Login, register, reset, contact, checkout, playback, progress, chat, webhooks, setup, verify. |
| Headers | CSP (allow-listed Razorpay/Zoom/Cloudflare/Supabase), HSTS, `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`. |
| Secrets | Server-only environment variables. Only `NEXT_PUBLIC_*` reach the browser, and none are secret. `.env*` is git-ignored. |
| Audit | `audit_logs` (Super Admin read-only): auth events, content decisions, pricing, orders, refunds, roles, invitations, certificates, privacy actions. |
| Privacy | Self-service JSON export, deletion requests (soft-delete + anonymisation; payment records retained), certificate verification shows first name + last initial only, chat shows "First L." only, recording notice before live classes. |
| Open redirects | `safeNext()` allows only same-site relative paths. |

## Before production

1. Generate strong `SESSION_SECRET`, `DATA_ENCRYPTION_KEY` and `CRON_SECRET`, and set `REQUIRE_ADMIN_MFA=true`.
2. Remove `SUPER_ADMIN_SETUP_TOKEN` after provisioning.
3. Set `APP_MODE=production` (disables the demo simulators and demo seed accounts) and **do not seed demo users**.
4. Configure Upstash rate limiting if running more than one instance.
5. Have the policy pages (Terms, Privacy, Refund) reviewed by counsel. They are marked "Draft for review".
6. Run an external penetration test against the preview deployment.
