# Deployment

The Academy is a **separate repository and deployment**. The existing tierraautomation.in site is not modified.

## 1. Supabase (database, auth, storage)

1. Create a project in **Mumbai (ap-south-1)**.
2. Apply the migrations with either:
   - `supabase link --project-ref <ref> && supabase db push` (files in `supabase/migrations/`), or
   - `DB_IS_SUPABASE=true DATABASE_URL=<direct connection> npm run db:migrate` (skips the local auth shim).
3. Storage: create buckets `academy-public` (public) and `academy-private` (private).
4. Auth: enable email provider. Set Site URL = your deployment URL, and add `<url>/reset-password` to the redirect allow-list.
5. Use the **transaction pooler** connection string (port 6543) as `DATABASE_URL` in Vercel.
6. Content: for a demo preview, run `npm run db:seed` with `SEED_DEMO_USERS=false` (content only), then provision the real Super Admin.

## 2. Vercel

1. Import the GitHub repo `tierra-academy` and choose framework Next.js.
2. Environment variables: copy from `.env.example`. At minimum set `DATABASE_URL`, `DB_IS_SUPABASE=true`, `SESSION_SECRET`, `DATA_ENCRYPTION_KEY`, `NEXT_PUBLIC_APP_URL`, `APP_MODE=demo`, `CRON_SECRET`, `SUPER_ADMIN_SETUP_TOKEN`.
3. Region: `bom1` (set in `vercel.json`).
4. Crons (`vercel.json`): reminders every 15 minutes and housekeeping hourly. Sub-daily crons need a Vercel Pro plan; on Hobby, change them to daily or trigger them from an external scheduler with `Authorization: Bearer $CRON_SECRET`.
5. Demo video clips: `storage/sample/*.mp4` are bundled through `outputFileTracingIncludes`. Uploaded videos need `VIDEO_PROVIDER=cloudflare`, because serverless disks are ephemeral.

## 3. Providers (after CEO approval)

| Provider | Steps |
|---|---|
| **Razorpay** | Use test keys → `RAZORPAY_KEY_ID/SECRET`. Dashboard → Webhooks → `https://<host>/api/payments/webhook/razorpay` with events `payment.captured`, `payment.failed`, `order.paid`, `refund.processed`, `refund.failed` and a secret → `RAZORPAY_WEBHOOK_SECRET`. Set `PAYMENTS_PROVIDER=razorpay`. Switch to live keys after KYC. |
| **Zoom** | Marketplace → Server-to-Server OAuth app (scopes: `meeting:write:admin`, `meeting:read:admin`, `report:read:admin`, `recording:read:admin`) → `ZOOM_ACCOUNT_ID/CLIENT_ID/CLIENT_SECRET`. Meeting SDK app → `ZOOM_MEETING_SDK_KEY/SECRET`. Event subscription → `https://<host>/api/live/webhook/zoom` (meeting.started, meeting.ended, recording.completed) → `ZOOM_WEBHOOK_SECRET_TOKEN`. Set `LIVE_PROVIDER=zoom`. Participant reports need a paid (Pro or higher) account. Check Zoom's current Meeting SDK publishing/approval requirements and browser support before launch. |
| **Cloudflare Stream** | API token with *Stream:Edit* → `CLOUDFLARE_STREAM_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, customer subdomain code → `CLOUDFLARE_STREAM_CUSTOMER_CODE`. Webhook → `https://<host>/api/videos/webhook/cloudflare` → `CLOUDFLARE_STREAM_WEBHOOK_SECRET`. Set `VIDEO_PROVIDER=cloudflare`. |
| **Email (Resend)** | Verify the `tierraautomation.in` sending domain (SPF/DKIM) → `RESEND_API_KEY`, `EMAIL_FROM`. Set `EMAIL_PROVIDER=resend`. |
| **Supabase Storage** | `SUPABASE_SERVICE_ROLE_KEY` (server only), `STORAGE_PROVIDER=supabase`. |
| **Upstash** (optional) | `UPSTASH_REDIS_REST_URL/TOKEN` for shared rate limits. |

## 4. Serving at `tierraautomation.in/academy` (later)

`basePath` is fixed **at build time**, so this needs a separate build:

1. Create a second Vercel project (or environment) with `NEXT_PUBLIC_BASE_PATH=/academy` and `NEXT_PUBLIC_APP_URL=https://tierraautomation.in`. Build with `npm run build:academy` (or set the env and run `next build`).
2. On the **existing** company site's host, add a reverse proxy/rewrite (requires company authorisation):
   - **Vercel (if the company site is on Vercel)**: `{"rewrites":[{"source":"/academy/:path*","destination":"https://<academy-project>.vercel.app/academy/:path*"}]}`
   - **Nginx**:
     ```nginx
     location /academy/ {
       proxy_pass https://<academy-project>.vercel.app/academy/;
       proxy_set_header Host <academy-project>.vercel.app;
       proxy_set_header X-Forwarded-Host tierraautomation.in;
       proxy_set_header X-Forwarded-Proto https;
     }
     ```
   - **Cloudflare**: a Worker or Origin Rule routing `/academy/*` to the Academy deployment.
3. Update the provider webhook URLs and the Supabase Auth redirect URLs to `https://tierraautomation.in/academy/...`.
4. Cookies are scoped to `/academy`, so they don't collide with the company site.

DNS of the company domain is **not** changed by this project.
