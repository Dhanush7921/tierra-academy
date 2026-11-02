import { z } from "zod";

/**
 * Server-side configuration. Parsed lazily so that `next build` works without
 * secrets; anything security-critical throws when first used if missing.
 */
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_MODE: z.enum(["demo", "production"]).default("demo"),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_BASE_PATH: z.string().default(""),
  DATABASE_URL: z.string().default("postgres://tierra:tierra_dev@127.0.0.1:5432/tierra_academy"),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(50).default(5),
  DB_IS_SUPABASE: z.enum(["true", "false"]).default("false"),
  SESSION_SECRET: z.string().default(""),
  DATA_ENCRYPTION_KEY: z.string().default(""),
  AUTH_PROVIDER: z.enum(["local", "supabase"]).default("local"),
  NEXT_PUBLIC_SUPABASE_URL: z.string().default(""),
  SUPABASE_ANON_KEY: z.string().default(""),
  SUPABASE_SERVICE_ROLE_KEY: z.string().default(""),
  REQUIRE_ADMIN_MFA: z.enum(["true", "false"]).default("false"),
  SUPER_ADMIN_SETUP_TOKEN: z.string().default(""),
  PAYMENTS_PROVIDER: z.enum(["demo", "razorpay"]).default("demo"),
  DEMO_PAYMENT_WEBHOOK_SECRET: z.string().default("local-demo-webhook-secret-change-me"),
  RAZORPAY_KEY_ID: z.string().default(""),
  RAZORPAY_KEY_SECRET: z.string().default(""),
  RAZORPAY_WEBHOOK_SECRET: z.string().default(""),
  LIVE_PROVIDER: z.enum(["demo", "zoom"]).default("demo"),
  ZOOM_ACCOUNT_ID: z.string().default(""),
  ZOOM_CLIENT_ID: z.string().default(""),
  ZOOM_CLIENT_SECRET: z.string().default(""),
  ZOOM_MEETING_SDK_KEY: z.string().default(""),
  ZOOM_MEETING_SDK_SECRET: z.string().default(""),
  ZOOM_WEBHOOK_SECRET_TOKEN: z.string().default(""),
  VIDEO_PROVIDER: z.enum(["local", "cloudflare"]).default("local"),
  CLOUDFLARE_ACCOUNT_ID: z.string().default(""),
  CLOUDFLARE_STREAM_API_TOKEN: z.string().default(""),
  CLOUDFLARE_STREAM_CUSTOMER_CODE: z.string().default(""),
  CLOUDFLARE_STREAM_WEBHOOK_SECRET: z.string().default(""),
  STORAGE_PROVIDER: z.enum(["local", "supabase"]).default("local"),
  SUPABASE_STORAGE_BUCKET_PUBLIC: z.string().default("academy-public"),
  SUPABASE_STORAGE_BUCKET_PRIVATE: z.string().default("academy-private"),
  EMAIL_PROVIDER: z.enum(["outbox", "resend"]).default("outbox"),
  EMAIL_FROM: z.string().default("Tierra Academy <academy@tierraautomation.in>"),
  RESEND_API_KEY: z.string().default(""),
  UPSTASH_REDIS_REST_URL: z.string().default(""),
  UPSTASH_REDIS_REST_TOKEN: z.string().default(""),
  CRON_SECRET: z.string().default(""),
  ERROR_WEBHOOK_URL: z.string().default(""),
});

export type Env = z.infer<typeof schema>;
let cached: Env | null = null;

export function env(): Env {
  if (!cached) cached = schema.parse(process.env);
  return cached;
}

/** for tests */
export function resetEnvCache() {
  cached = null;
}

export function sessionSecret(): string {
  const s = env().SESSION_SECRET;
  if (s.length >= 32) return s;
  if (env().NODE_ENV === "production") throw new Error("SESSION_SECRET must be set (32+ chars) in production");
  return "dev-only-insecure-session-secret-0123456789abcdef";
}

export function encryptionKey(): string {
  const k = env().DATA_ENCRYPTION_KEY || sessionSecret();
  if (env().NODE_ENV === "production" && k.length < 32) throw new Error("DATA_ENCRYPTION_KEY must be set in production");
  return k;
}

export const isDemoMode = () => env().APP_MODE === "demo";
