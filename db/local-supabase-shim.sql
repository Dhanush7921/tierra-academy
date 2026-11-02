-- ─────────────────────────────────────────────────────────────────────────────
-- LOCAL DEVELOPMENT ONLY.
-- Recreates the small subset of Supabase's platform objects that the Academy
-- migrations depend on: the `auth` schema, `auth.users`, `auth.uid()`,
-- `auth.jwt()` and the `anon` / `authenticated` / `service_role` roles.
-- On a real Supabase project these already exist — DO NOT run this file there.
-- scripts/migrate.ts applies it automatically only when DB_IS_SUPABASE != true.
-- ─────────────────────────────────────────────────────────────────────────────

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
exception when insufficient_privilege then
  raise notice 'Could not create roles (needs CREATEROLE). Create anon/authenticated manually.';
end $$;
-- service_role (BYPASSRLS) needs a superuser; the app itself uses the table-owner login for service work.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin noinherit bypassrls; end if;
exception when insufficient_privilege then
  create role service_role nologin noinherit;
end $$;

-- allow the application login role to switch into the request roles (like Supabase's `authenticator`)
do $$ begin
  execute format('grant anon, authenticated to %I', current_user);
exception when others then raise notice 'grant roles skipped: %', sqlerrm; end $$;

create schema if not exists auth;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table if not exists auth.users (
  id uuid primary key default extensions.gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb default '{}'::jsonb,
  email_confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function auth.uid() returns uuid
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

create or replace function auth.jwt() returns jsonb
language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema extensions to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant execute on function auth.jwt() to anon, authenticated, service_role;
