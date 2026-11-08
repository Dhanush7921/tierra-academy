-- Paid catalogue: per-course duration/price options, configurable tax, pricing snapshot on orders.
-- Amounts are INR paise (integers). Only a Super Admin can write prices (RLS + no CM policy).

create table public.course_price_options (
  id uuid primary key default extensions.gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  label text not null check (char_length(label) between 1 and 60),
  duration_days integer check (duration_days is null or duration_days between 1 and 3650),
  price_paise integer not null check (price_paise > 0),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (course_id, label)
);
create index course_price_options_course_idx on public.course_price_options (course_id, sort_order);
create trigger course_price_options_touch before update on public.course_price_options
  for each row execute function public.touch_updated_at();

alter table public.course_price_options enable row level security;
create policy cpo_public_read on public.course_price_options for select to anon
  using (is_active and exists (select 1 from public.courses c where c.id = course_id and c.status = 'PUBLISHED'));
create policy cpo_read on public.course_price_options for select to authenticated
  using ((is_active and exists (select 1 from public.courses c where c.id = course_id and c.status = 'PUBLISHED'))
         or public.is_super_admin() or public.manages_course(course_id));
create policy cpo_admin_write on public.course_price_options for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());
grant select on public.course_price_options to anon;
grant select, insert, update, delete on public.course_price_options to authenticated;

-- courses.price_paise mirrors the lowest active option ("from" price used by cards and sorting).
create or replace function public.sync_course_from_price() returns trigger
language plpgsql security definer set search_path = '' as $$
declare cid uuid := coalesce(new.course_id, old.course_id); p integer;
begin
  select min(price_paise) into p from public.course_price_options where course_id = cid and is_active;
  if p is not null then
    update public.courses set is_free = false, price_paise = p where id = cid and (is_free or price_paise <> p);
  end if;
  return null;
end $$;
revoke all on function public.sync_course_from_price() from public;
create trigger course_price_options_sync after insert or update or delete on public.course_price_options
  for each row execute function public.sync_course_from_price();

-- Pricing snapshot: editing a course price never changes historical orders.
alter table public.orders
  add column price_option_id uuid references public.course_price_options(id) on delete set null,
  add column option_label text,
  add column duration_days integer,
  add column tax_label text,
  add column tax_rate_bp integer not null default 0 check (tax_rate_bp between 0 and 10000),
  add column tax_paise integer not null default 0 check (tax_paise >= 0),
  add column pricing_snapshot jsonb;
