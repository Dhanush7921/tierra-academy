/**
 * One-time Super Admin provisioning from a trusted shell (alternative to the /setup page).
 *   SUPER_ADMIN_PASSWORD='…' npm run provision:super-admin -- --email ceo@tierraautomation.in --name "Full Name"
 * Refuses to run if any Super Admin already exists. Works with AUTH_PROVIDER=local.
 * (With Supabase Auth, create the user in Supabase first, then run with --existing.)
 */
import postgres from "postgres";
import { hashPassword } from "../src/lib/crypto";

const arg = (k: string) => { const i = process.argv.indexOf(`--${k}`); return i > -1 ? process.argv[i + 1] : undefined; };
const email = arg("email")?.trim().toLowerCase();
const name = arg("name") ?? "Super Admin";
const existing = process.argv.includes("--existing");
const pw = process.env.SUPER_ADMIN_PASSWORD;

(async () => {
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("--email is required");
  if (!existing && (!pw || pw.length < 12)) throw new Error("Set SUPER_ADMIN_PASSWORD (12+ characters) in the environment — never pass it as an argument.");
  const sql = postgres(process.env.DATABASE_URL || "postgres://tierra:tierra_dev@127.0.0.1:5432/tierra_academy", { max: 1 });
  try {
    await sql.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(424242)`;
      const [e] = await tx`select exists (select 1 from public.user_roles where role = 'SUPER_ADMIN') as e`;
      if (e.e) throw new Error("A Super Admin already exists. Provisioning is closed.");
      let [p] = await tx`select id from public.profiles where email = ${email}`;
      if (!p) {
        if (existing) throw new Error("No profile for that email. Sign up first or omit --existing.");
        const [u] = await tx`insert into auth.users (email, email_confirmed_at) values (${email}, now()) returning id`;
        await tx`insert into public.profiles (id, email, full_name) values (${u.id}, ${email}, ${name})`;
        await tx`insert into public.local_credentials (user_id, password_hash) values (${u.id}, ${await hashPassword(pw!)})`;
        p = u;
      }
      await tx`insert into public.user_roles (user_id, role) values (${p.id}, 'SUPER_ADMIN'), (${p.id}, 'STUDENT') on conflict do nothing`;
      await tx`insert into public.audit_logs (actor_id, actor_role, action, entity_type, entity_id) values (${p.id}, 'SUPER_ADMIN', 'setup.super_admin_provisioned_cli', 'profile', ${p.id})`;
    });
    console.log(`✓ Super Admin provisioned for ${email}. Sign in and enable two-factor authentication at /mfa/setup.`);
  } finally {
    await sql.end();
  }
})().catch((e) => { console.error("✗", e.message); process.exit(1); });
