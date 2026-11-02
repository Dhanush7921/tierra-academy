-- TIERRA ACADEMY — core schema
-- Money is stored in the smallest currency unit (paise for INR).

create extension if not exists pgcrypto with schema extensions;
create extension if not exists citext with schema extensions;

-- ── enums ────────────────────────────────────────────────────────────────────
create type public.app_role as enum ('SUPER_ADMIN', 'CONTENT_MANAGER', 'STUDENT');
create type public.course_status as enum ('DRAFT', 'REVIEW', 'APPROVED', 'REJECTED', 'PUBLISHED', 'ARCHIVED');
create type public.course_delivery as enum ('RECORDED', 'LIVE', 'HYBRID');
create type public.course_level as enum ('BEGINNER', 'INTERMEDIATE', 'ADVANCED');
create type public.lesson_kind as enum ('VIDEO', 'ARTICLE', 'LIVE', 'QUIZ', 'ASSIGNMENT');
create type public.video_status as enum ('PENDING_UPLOAD', 'UPLOADING', 'PROCESSING', 'READY', 'ERROR');
create type public.revision_status as enum ('DRAFT', 'REVIEW', 'APPROVED', 'REJECTED', 'APPLIED');
create type public.approval_status as enum ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');
create type public.live_status as enum ('PROPOSED', 'SCHEDULED', 'LIVE', 'ENDED', 'CANCELLED', 'REJECTED');
create type public.recording_status as enum ('NONE', 'PENDING', 'PROCESSING', 'READY', 'FAILED', 'IMPORTED');
create type public.enrollment_status as enum ('ACTIVE', 'COMPLETED', 'REVOKED', 'REFUNDED');
create type public.enrollment_source as enum ('FREE', 'PURCHASE', 'COUPON', 'COMPLIMENTARY', 'INVITATION', 'ADMIN');
create type public.order_status as enum ('CREATED', 'PENDING', 'PAID', 'FAILED', 'CANCELLED', 'REFUNDED', 'PARTIALLY_REFUNDED');
create type public.payment_status as enum ('AUTHORIZED', 'CAPTURED', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED');
create type public.refund_status as enum ('REQUESTED', 'APPROVED', 'PROCESSING', 'PROCESSED', 'REJECTED', 'FAILED');
create type public.coupon_kind as enum ('PERCENT', 'FLAT');
create type public.notification_kind as enum ('INFO', 'ENROLLMENT', 'PAYMENT', 'LIVE', 'APPROVAL', 'CERTIFICATE', 'ASSIGNMENT', 'SYSTEM');

-- ── identity ─────────────────────────────────────────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email extensions.citext not null unique,
  full_name text not null default '',
  phone text,
  avatar_url text,
  bio text,
  city text,
  notify_email boolean not null default true,
  notify_live_reminders boolean not null default true,
  session_version integer not null default 1,
  is_disabled boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_roles (
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.app_role not null,
  granted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);
create index user_roles_role_idx on public.user_roles(role);

-- password hashes for AUTH_PROVIDER=local (never readable through RLS)
create table public.local_credentials (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  password_hash text not null,
  reset_token_hash text,
  reset_expires_at timestamptz,
  failed_attempts integer not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

create table public.mfa_factors (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null default 'TOTP' check (kind in ('TOTP')),
  secret_encrypted text not null,
  verified_at timestamptz,
  last_used_step bigint,
  created_at timestamptz not null default now(),
  unique (user_id, kind)
);

-- ── catalogue ────────────────────────────────────────────────────────────────
create table public.course_categories (
  id uuid primary key default extensions.gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name text not null,
  tagline text not null default '',
  description text not null default '',
  accent text not null default '#FF8A00',
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.instructor_profiles (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid unique references public.profiles(id) on delete set null,
  display_name text not null,
  headline text not null default '',
  bio text not null default '',
  expertise text[] not null default '{}',
  avatar_url text,
  is_demo boolean not null default false,
  is_public boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.courses (
  id uuid primary key default extensions.gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  title text not null check (char_length(title) between 3 and 160),
  subtitle text not null default '',
  description text not null default '',
  requirements text[] not null default '{}',
  outcomes text[] not null default '{}',
  category_id uuid not null references public.course_categories(id),
  level public.course_level not null default 'BEGINNER',
  delivery public.course_delivery not null default 'RECORDED',
  language text not null default 'English',
  thumbnail_url text,
  preview_video_asset_id uuid,
  is_free boolean not null default true,
  price_paise integer not null default 0 check (price_paise >= 0),
  compare_at_price_paise integer check (compare_at_price_paise is null or compare_at_price_paise >= 0),
  currency text not null default 'INR' check (currency ~ '^[A-Z]{3}$'),
  enrollment_open boolean not null default true,
  enrollment_capacity integer check (enrollment_capacity is null or enrollment_capacity > 0),
  enrollment_starts_at timestamptz,
  enrollment_ends_at timestamptz,
  access_days integer check (access_days is null or access_days > 0),
  certificate_enabled boolean not null default true,
  min_attendance_percent integer not null default 0 check (min_attendance_percent between 0 and 100),
  estimated_hours numeric(6,1) not null default 0,
  status public.course_status not null default 'DRAFT',
  instructor_id uuid references public.instructor_profiles(id) on delete set null,
  is_demo boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  published_at timestamptz,
  archived_at timestamptz,
  search_vector tsvector generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(subtitle, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'C')
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint paid_course_has_price check (is_free or price_paise > 0),
  constraint free_course_zero_price check (not is_free or price_paise = 0)
);
create index courses_status_idx on public.courses(status, published_at desc);
create index courses_category_idx on public.courses(category_id, status);
create index courses_search_idx on public.courses using gin(search_vector);
create index courses_created_by_idx on public.courses(created_by);

create table public.content_manager_assignments (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  can_host_live boolean not null default true,
  assigned_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, course_id)
);
create index cma_course_idx on public.content_manager_assignments(course_id);

create table public.course_modules (
  id uuid primary key default extensions.gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  title text not null,
  description text not null default '',
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index course_modules_course_idx on public.course_modules(course_id, position);

create table public.video_assets (
  id uuid primary key default extensions.gen_random_uuid(),
  provider text not null check (provider in ('cloudflare', 'local', 'sample')),
  provider_uid text not null,
  course_id uuid references public.courses(id) on delete set null,
  status public.video_status not null default 'PENDING_UPLOAD',
  original_filename text,
  size_bytes bigint,
  duration_seconds integer,
  thumbnail_url text,
  captions jsonb not null default '[]'::jsonb,   -- [{lang,label,src}]
  error_message text,
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_uid)
);
create index video_assets_course_idx on public.video_assets(course_id);

alter table public.courses
  add constraint courses_preview_video_fk foreign key (preview_video_asset_id) references public.video_assets(id) on delete set null;

create table public.lessons (
  id uuid primary key default extensions.gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  module_id uuid not null references public.course_modules(id) on delete cascade,
  title text not null,
  summary text not null default '',
  body text not null default '',
  kind public.lesson_kind not null default 'VIDEO',
  video_asset_id uuid references public.video_assets(id) on delete set null,
  duration_seconds integer not null default 0,
  position integer not null default 0,
  is_preview boolean not null default false,
  is_required boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index lessons_module_idx on public.lessons(module_id, position);
create index lessons_course_idx on public.lessons(course_id);

create table public.lesson_resources (
  id uuid primary key default extensions.gen_random_uuid(),
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  title text not null,
  storage_provider text not null default 'local',
  storage_key text not null,
  mime_type text not null,
  size_bytes bigint not null default 0,
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index lesson_resources_lesson_idx on public.lesson_resources(lesson_id);

-- ── governance ───────────────────────────────────────────────────────────────
create table public.content_revisions (
  id uuid primary key default extensions.gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  entity_type text not null check (entity_type in ('course', 'lesson', 'module')),
  entity_id uuid not null,
  payload jsonb not null,
  status public.revision_status not null default 'DRAFT',
  author_id uuid references public.profiles(id) on delete set null,
  reviewer_id uuid references public.profiles(id) on delete set null,
  reviewer_comment text,
  applied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index content_revisions_course_idx on public.content_revisions(course_id, status);

create table public.approval_requests (
  id uuid primary key default extensions.gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  revision_id uuid references public.content_revisions(id) on delete cascade,
  live_session_id uuid,
  kind text not null check (kind in ('COURSE_PUBLISH', 'REVISION', 'LIVE_SESSION')),
  status public.approval_status not null default 'PENDING',
  requested_by uuid references public.profiles(id) on delete set null,
  note text,
  decided_by uuid references public.profiles(id) on delete set null,
  decision_comment text,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index approval_requests_status_idx on public.approval_requests(status, created_at desc);
create index approval_requests_course_idx on public.approval_requests(course_id);

-- ── live ─────────────────────────────────────────────────────────────────────
create table public.live_sessions (
  id uuid primary key default extensions.gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  title text not null,
  description text not null default '',
  starts_at timestamptz not null,
  duration_minutes integer not null default 60 check (duration_minutes between 10 and 600),
  host_id uuid references public.profiles(id) on delete set null,
  status public.live_status not null default 'PROPOSED',
  provider text not null default 'demo' check (provider in ('demo', 'zoom')),
  recording_status public.recording_status not null default 'NONE',
  recording_video_asset_id uuid references public.video_assets(id) on delete set null,
  recording_consent_notice boolean not null default true,
  reminder_sent_at timestamptz,
  proposed_by uuid references public.profiles(id) on delete set null,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index live_sessions_time_idx on public.live_sessions(status, starts_at);
create index live_sessions_course_idx on public.live_sessions(course_id, starts_at);

alter table public.approval_requests
  add constraint approval_live_fk foreign key (live_session_id) references public.live_sessions(id) on delete cascade;

-- meeting credentials are kept apart from public session metadata
create table public.live_session_secrets (
  live_session_id uuid primary key references public.live_sessions(id) on delete cascade,
  meeting_id text,
  meeting_uuid text,
  passcode text,
  join_url text,
  start_url text,
  updated_at timestamptz not null default now()
);

create table public.attendance (
  id uuid primary key default extensions.gen_random_uuid(),
  live_session_id uuid not null references public.live_sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  last_seen_at timestamptz not null default now(),
  duration_seconds integer not null default 0,
  source text not null default 'app' check (source in ('app', 'zoom_report', 'manual')),
  unique (live_session_id, user_id)
);
create index attendance_user_idx on public.attendance(user_id);

create table public.live_session_messages (
  id bigserial primary key,
  live_session_id uuid not null references public.live_sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index live_messages_session_idx on public.live_session_messages(live_session_id, id);

-- ── commerce ─────────────────────────────────────────────────────────────────
create table public.coupons (
  id uuid primary key default extensions.gen_random_uuid(),
  code extensions.citext not null unique check (code ~* '^[A-Z0-9_-]{3,32}$'),
  kind public.coupon_kind not null,
  value integer not null check (value > 0),
  course_id uuid references public.courses(id) on delete cascade,
  max_redemptions integer check (max_redemptions is null or max_redemptions > 0),
  redeemed_count integer not null default 0,
  valid_from timestamptz,
  valid_until timestamptz,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint percent_range check (kind <> 'PERCENT' or value <= 100)
);

create table public.orders (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete restrict,
  course_id uuid not null references public.courses(id) on delete restrict,
  status public.order_status not null default 'CREATED',
  provider text not null check (provider in ('demo', 'razorpay', 'none')),
  provider_order_id text unique,
  subtotal_paise integer not null check (subtotal_paise >= 0),
  discount_paise integer not null default 0 check (discount_paise >= 0),
  amount_paise integer not null check (amount_paise >= 0),
  currency text not null default 'INR',
  coupon_id uuid references public.coupons(id) on delete set null,
  receipt text not null unique,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index orders_user_idx on public.orders(user_id, created_at desc);
create index orders_status_idx on public.orders(status, created_at desc);
create index orders_course_idx on public.orders(course_id);

create table public.payments (
  id uuid primary key default extensions.gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete restrict,
  provider text not null,
  provider_payment_id text not null,
  status public.payment_status not null,
  amount_paise integer not null,
  currency text not null default 'INR',
  method text,
  failure_reason text,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_payment_id)
);
create index payments_order_idx on public.payments(order_id);
create index payments_user_idx on public.payments(user_id, created_at desc);

create table public.refunds (
  id uuid primary key default extensions.gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  payment_id uuid references public.payments(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete restrict,
  amount_paise integer not null check (amount_paise > 0),
  reason text not null default '',
  status public.refund_status not null default 'REQUESTED',
  provider_refund_id text unique,
  requested_by uuid references public.profiles(id) on delete set null,
  decided_by uuid references public.profiles(id) on delete set null,
  decision_note text,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index refunds_status_idx on public.refunds(status, created_at desc);
create unique index refunds_one_open_per_order on public.refunds(order_id) where status in ('REQUESTED', 'APPROVED', 'PROCESSING');

create table public.webhook_events (
  id bigserial primary key,
  provider text not null,
  event_id text not null,
  event_type text not null,
  payload jsonb not null,
  processed_at timestamptz,
  error text,
  received_at timestamptz not null default now(),
  unique (provider, event_id)
);

create table public.enrollments (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  status public.enrollment_status not null default 'ACTIVE',
  source public.enrollment_source not null,
  order_id uuid references public.orders(id) on delete set null,
  invitation_id uuid,
  granted_by uuid references public.profiles(id) on delete set null,
  progress_percent numeric(5,2) not null default 0,
  last_lesson_id uuid references public.lessons(id) on delete set null,
  expires_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, course_id)
);
create index enrollments_course_idx on public.enrollments(course_id, status);
create index enrollments_created_idx on public.enrollments(created_at);

create table public.lesson_progress (
  user_id uuid not null references public.profiles(id) on delete cascade,
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  position_seconds integer not null default 0 check (position_seconds >= 0),
  watched_seconds integer not null default 0 check (watched_seconds >= 0),
  completed boolean not null default false,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);
create index lesson_progress_course_idx on public.lesson_progress(user_id, course_id);

create table public.invitations (
  id uuid primary key default extensions.gen_random_uuid(),
  token_hash text not null unique,
  course_id uuid references public.courses(id) on delete cascade,
  live_session_id uuid references public.live_sessions(id) on delete cascade,
  email extensions.citext,
  grants_complimentary boolean not null default false,
  max_uses integer not null default 1 check (max_uses between 1 and 10000),
  use_count integer not null default 0,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  note text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint invitation_target check (course_id is not null or live_session_id is not null)
);
create index invitations_course_idx on public.invitations(course_id);

alter table public.enrollments
  add constraint enrollments_invitation_fk foreign key (invitation_id) references public.invitations(id) on delete set null;

create table public.invitation_redemptions (
  invitation_id uuid not null references public.invitations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  redeemed_at timestamptz not null default now(),
  primary key (invitation_id, user_id)
);

-- ── assessment ───────────────────────────────────────────────────────────────
create table public.quizzes (
  id uuid primary key default extensions.gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  lesson_id uuid references public.lessons(id) on delete set null,
  title text not null,
  description text not null default '',
  pass_percent integer not null default 60 check (pass_percent between 1 and 100),
  max_attempts integer check (max_attempts is null or max_attempts > 0),
  time_limit_minutes integer check (time_limit_minutes is null or time_limit_minutes > 0),
  is_required boolean not null default true,
  is_published boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index quizzes_course_idx on public.quizzes(course_id);

create table public.questions (
  id uuid primary key default extensions.gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  prompt text not null,
  options jsonb not null check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) between 2 and 8),
  correct_index integer not null check (correct_index >= 0),
  explanation text not null default '',
  points integer not null default 1 check (points > 0),
  position integer not null default 0,
  constraint correct_in_range check (correct_index < jsonb_array_length(options))
);
create index questions_quiz_idx on public.questions(quiz_id, position);

create table public.quiz_attempts (
  id uuid primary key default extensions.gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  answers jsonb not null default '{}'::jsonb,
  score integer not null default 0,
  max_score integer not null default 0,
  percent numeric(5,2) not null default 0,
  passed boolean not null default false,
  started_at timestamptz not null default now(),
  submitted_at timestamptz
);
create index quiz_attempts_user_idx on public.quiz_attempts(user_id, quiz_id);

create table public.assignments (
  id uuid primary key default extensions.gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  lesson_id uuid references public.lessons(id) on delete set null,
  title text not null,
  instructions text not null default '',
  due_at timestamptz,
  max_points integer not null default 100 check (max_points > 0),
  pass_points integer not null default 50 check (pass_points >= 0),
  allow_text boolean not null default true,
  allow_link boolean not null default true,
  allow_file boolean not null default true,
  allowed_mime_types text[] not null default array['application/pdf','image/png','image/jpeg','application/zip'],
  max_file_mb integer not null default 10 check (max_file_mb between 1 and 50),
  is_required boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index assignments_course_idx on public.assignments(course_id);

create table public.submissions (
  id uuid primary key default extensions.gen_random_uuid(),
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  text_answer text,
  link_url text check (link_url is null or link_url ~* '^https?://'),
  file_key text,
  file_mime text,
  file_size_bytes bigint,
  status text not null default 'SUBMITTED' check (status in ('SUBMITTED', 'GRADED', 'RETURNED')),
  points integer,
  feedback text,
  graded_by uuid references public.profiles(id) on delete set null,
  graded_at timestamptz,
  submitted_at timestamptz not null default now(),
  unique (assignment_id, user_id)
);

create table public.certificates (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  verification_code text not null unique check (verification_code ~ '^TA-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$'),
  recipient_name text not null,
  course_title text not null,
  issued_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoke_reason text,
  issued_by uuid references public.profiles(id) on delete set null,
  unique (user_id, course_id)
);

-- ── platform ─────────────────────────────────────────────────────────────────
create table public.notifications (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind public.notification_kind not null default 'INFO',
  title text not null,
  body text not null default '',
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications(user_id, created_at desc);
create index notifications_unread_idx on public.notifications(user_id) where read_at is null;

create table public.audit_logs (
  id bigserial primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  actor_role text,
  action text not null,
  entity_type text not null,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  ip text,
  created_at timestamptz not null default now()
);
create index audit_logs_created_idx on public.audit_logs(created_at desc);
create index audit_logs_entity_idx on public.audit_logs(entity_type, entity_id);
create index audit_logs_actor_idx on public.audit_logs(actor_id, created_at desc);

create table public.email_outbox (
  id uuid primary key default extensions.gen_random_uuid(),
  to_email text not null,
  subject text not null,
  html text not null,
  text_body text not null default '',
  template text,
  status text not null default 'QUEUED' check (status in ('QUEUED', 'SENT', 'DEV_OUTBOX', 'FAILED')),
  provider_message_id text,
  error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index email_outbox_created_idx on public.email_outbox(created_at desc);

create table public.platform_settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table public.contact_messages (
  id uuid primary key default extensions.gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  email extensions.citext not null,
  topic text not null default 'general',
  message text not null check (char_length(message) between 10 and 4000),
  handled_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.data_requests (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('EXPORT', 'DELETE')),
  status text not null default 'PENDING' check (status in ('PENDING', 'COMPLETED', 'REJECTED')),
  note text,
  handled_by uuid references public.profiles(id) on delete set null,
  handled_at timestamptz,
  created_at timestamptz not null default now()
);

-- ── updated_at maintenance ───────────────────────────────────────────────────
create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;

do $$
declare t text;
begin
  foreach t in array array['profiles','courses','course_modules','lessons','video_assets','content_revisions',
    'live_sessions','orders','payments','refunds','enrollments','quizzes','assignments'] loop
    execute format('create trigger %I_touch before update on public.%I for each row execute function public.touch_updated_at()', t, t);
  end loop;
end $$;
