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

## 4. Production on Railway at `tierraautomation.in/academy` (paid build)

The Academy runs as its **own Railway project** (Next.js service + Postgres), so it can be deployed and rolled back independently of the company site.

1. Railway → New project → Deploy from GitHub `Dhanush7921/tierra-academy`, branch `production-paid` (merge to `main` when approved). Add the **Postgres** template.
2. Service variables (generate secrets with `openssl rand -base64 48`; never commit them):
   `DATABASE_URL=${{Postgres.DATABASE_URL}}`, `APP_MODE=production`, `NODE_ENV=production`, `NEXT_PUBLIC_BASE_PATH=/academy`,
   `NEXT_PUBLIC_APP_URL=https://tierraautomation.in`, `SESSION_SECRET`, `DATA_ENCRYPTION_KEY`, `CRON_SECRET`, `SUPER_ADMIN_SETUP_TOKEN`, `REQUIRE_ADMIN_MFA=true`.
   Leave `PAYMENTS_PROVIDER`, `LIVE_PROVIDER`, `VIDEO_PROVIDER` unset until real keys exist: checkout and live joining stay closed in production.
3. Build `npm run build`, start `npm run start`, pre-deploy `npm run db:migrate && npm run db:seed:production`, healthcheck `/academy/api/health`.
4. Open `https://tierraautomation.in/academy/setup` once with the setup token to create the real Super Admin, then remove `SUPER_ADMIN_SETUP_TOKEN`.
5. Super Admin → Settings → **Tax & checkout**: enter the tax confirmed by your accountant and tick "final". Checkout opens only when tax is confirmed **and** Razorpay keys + webhook secret are set.

### Company site (Caddy) — the only change needed there

Add this block to the company site's Caddyfile **above** the SPA fallback (`try_files … /index.html` / `file_server`). It keeps the `/academy` prefix (`handle`, not `handle_path`), because the Academy is built with basePath `/academy`:

```caddy
@academy path /academy /academy/*
handle @academy {
	# the Academy sends its own Permissions-Policy (camera/mic only for its live classroom)
	header -Permissions-Policy
	reverse_proxy {$ACADEMY_UPSTREAM} {
		header_up Host {upstream_hostport}
		header_up X-Forwarded-Host {host}
		header_up X-Forwarded-Proto {scheme}
	}
}
```

Set `ACADEMY_UPSTREAM=https://<academy-service>.up.railway.app` (or `http://<service>.railway.internal:<PORT>` if both services share a Railway project) on the company service. **Rollback:** remove the block (or unset the variable) and redeploy the company site; the Academy project is untouched. Company DNS is not changed.

## 5. Other hosts for `/academy`

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
