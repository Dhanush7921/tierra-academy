-- TIERRA ACADEMY — authorization helpers, Row Level Security, guard triggers.
--
-- Model:
--   * Browser/API requests run as role `authenticated` (or `anon`) with JWT claims set,
--     so every query is filtered by the policies below (defence in depth).
--   * Trusted server code (payment webhooks, enrollment after verified payment,
--     certificate issuance, audit logging) runs as the table owner / service role.
--   * Guard triggers protect sensitive COLUMNS that RLS (row-level) cannot express:
--     prices, publishing status, complimentary invitations, grades.

-- ── helpers (SECURITY DEFINER so they can read role tables without recursion) ──
create or replace function public.in_request_context() returns boolean
language sql stable set search_path = '' as $$
  select current_user in ('authenticated', 'anon')
$$;

create or replace function public.has_role(r public.app_role) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.user_roles ur
    join public.profiles p on p.id = ur.user_id
    where ur.user_id = auth.uid() and ur.role = r and not p.is_disabled and p.deleted_at is null
  )
$$;

create or replace function public.is_super_admin() returns boolean
language sql stable security definer set search_path = '' as $$ select public.has_role('SUPER_ADMIN') $$;

create or replace function public.is_content_manager() returns boolean
language sql stable security definer set search_path = '' as $$ select public.has_role('CONTENT_MANAGER') $$;

create or replace function public.manages_course(cid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_super_admin() or (
    public.is_content_manager() and exists (
      select 1 from public.content_manager_assignments a where a.course_id = cid and a.user_id = auth.uid()
    )
  )
$$;

create or replace function public.is_enrolled(cid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.enrollments e
    where e.course_id = cid and e.user_id = auth.uid()
      and e.status in ('ACTIVE', 'COMPLETED')
      and (e.expires_at is null or e.expires_at > now())
  )
$$;

create or replace function public.course_is_published(cid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.courses c where c.id = cid and c.status = 'PUBLISHED')
$$;

-- structural content (modules/lessons) may be edited directly only while not live
create or replace function public.course_is_editable(cid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.courses c where c.id = cid and c.status in ('DRAFT', 'REJECTED'))
$$;

create or replace function public.can_edit_structure(cid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_super_admin() or (public.manages_course(cid) and public.course_is_editable(cid))
$$;

create or replace function public.can_join_live(sid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.live_sessions s
    where s.id = sid and s.status in ('SCHEDULED', 'LIVE', 'ENDED')
      and (public.manages_course(s.course_id) or public.is_enrolled(s.course_id))
  )
$$;

-- ── public read-only functions ──────────────────────────────────────────────
create or replace function public.course_outline(p_course_id uuid)
returns table (module_id uuid, module_title text, module_position int, lesson_id uuid, lesson_title text,
               lesson_kind public.lesson_kind, duration_seconds int, is_preview boolean, lesson_position int)
language sql stable security definer set search_path = '' as $$
  select m.id, m.title, m.position, l.id, l.title, l.kind, l.duration_seconds, l.is_preview, l.position
  from public.course_modules m
  left join public.lessons l on l.module_id = m.id
  where m.course_id = p_course_id
    and (public.course_is_published(p_course_id) or public.manages_course(p_course_id) or public.is_enrolled(p_course_id))
  order by m.position, l.position
$$;

-- Public certificate verification. Privacy: returns first name + last initial only.
create or replace function public.verify_certificate(p_code text)
returns table (verification_code text, recipient_display text, course_title text, issued_at timestamptz, is_revoked boolean)
language sql stable security definer set search_path = '' as $$
  select c.verification_code,
         split_part(trim(c.recipient_name), ' ', 1) ||
           case when position(' ' in trim(c.recipient_name)) > 0
                then ' ' || left(reverse(split_part(reverse(trim(c.recipient_name)), ' ', 1)), 1) || '.'
                else '' end,
         c.course_title, c.issued_at, c.revoked_at is not null
  from public.certificates c
  where c.verification_code = upper(trim(p_code))
  limit 1
$$;

-- ── grants ──────────────────────────────────────────────────────────────────
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant select on public.course_categories, public.courses, public.instructor_profiles,
                public.course_modules, public.live_sessions to anon;
revoke all on function public.course_outline(uuid) from public;
revoke all on function public.verify_certificate(text) from public;
grant execute on function public.course_outline(uuid) to anon, authenticated;
grant execute on function public.verify_certificate(text) to anon, authenticated;
grant execute on function public.has_role(public.app_role), public.is_super_admin(), public.is_content_manager(),
  public.manages_course(uuid), public.is_enrolled(uuid), public.course_is_published(uuid),
  public.course_is_editable(uuid), public.can_edit_structure(uuid), public.can_join_live(uuid),
  public.in_request_context() to anon, authenticated;

-- ── enable RLS everywhere ───────────────────────────────────────────────────
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end $$;

-- Tables with NO policies are service-only: local_credentials, mfa_factors,
-- live_session_secrets, webhook_events.

-- profiles
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_super_admin());
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_super_admin()) with check (id = auth.uid() or public.is_super_admin());

-- user_roles: Super Admin manages non-super-admin roles. SUPER_ADMIN is only granted via provisioning.
create policy roles_select on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.is_super_admin());
create policy roles_insert on public.user_roles for insert to authenticated
  with check (public.is_super_admin() and role <> 'SUPER_ADMIN');
create policy roles_delete on public.user_roles for delete to authenticated
  using (public.is_super_admin() and role <> 'SUPER_ADMIN');

-- categories / instructors (public catalogue)
create policy categories_read on public.course_categories for select to anon, authenticated using (true);
create policy categories_admin on public.course_categories for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());
create policy instructors_read on public.instructor_profiles for select to anon, authenticated
  using (is_public or public.is_super_admin() or user_id = auth.uid());
create policy instructors_admin on public.instructor_profiles for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

-- courses
create policy courses_public_read on public.courses for select to anon using (status = 'PUBLISHED');
create policy courses_read on public.courses for select to authenticated
  using (status = 'PUBLISHED' or public.manages_course(id) or public.is_enrolled(id)
         -- creators can see what they just inserted (assignment row is added by an AFTER trigger)
         or (created_by = auth.uid() and public.is_content_manager()));
create policy courses_insert on public.courses for insert to authenticated
  with check (public.is_super_admin() or (public.is_content_manager() and created_by = auth.uid() and status = 'DRAFT'));
create policy courses_update on public.courses for update to authenticated
  using (public.is_super_admin() or (public.manages_course(id) and status in ('DRAFT', 'REJECTED')))
  with check (public.is_super_admin() or (public.manages_course(id) and status in ('DRAFT', 'REVIEW', 'REJECTED')));
create policy courses_delete on public.courses for delete to authenticated using (public.is_super_admin());

-- assignments of content managers
create policy cma_read on public.content_manager_assignments for select to authenticated
  using (user_id = auth.uid() or public.is_super_admin());
create policy cma_admin on public.content_manager_assignments for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

-- modules
create policy modules_public_read on public.course_modules for select to anon using (public.course_is_published(course_id));
create policy modules_read on public.course_modules for select to authenticated
  using (public.course_is_published(course_id) or public.manages_course(course_id) or public.is_enrolled(course_id));
create policy modules_write on public.course_modules for all to authenticated
  using (public.can_edit_structure(course_id)) with check (public.can_edit_structure(course_id));

-- lessons (bodies are private; public outline comes from course_outline())
create policy lessons_read on public.lessons for select to authenticated
  using (public.manages_course(course_id) or public.is_enrolled(course_id)
         or (is_preview and public.course_is_published(course_id)));
create policy lessons_write on public.lessons for all to authenticated
  using (public.can_edit_structure(course_id)) with check (public.can_edit_structure(course_id));

create policy resources_read on public.lesson_resources for select to authenticated
  using (public.manages_course(course_id) or public.is_enrolled(course_id));
create policy resources_write on public.lesson_resources for all to authenticated
  using (public.manages_course(course_id)) with check (public.manages_course(course_id) and uploaded_by = auth.uid());

-- video assets: staff only. Students receive short-lived playback tokens from the server.
create policy videos_read on public.video_assets for select to authenticated
  using (public.is_super_admin() or uploaded_by = auth.uid() or (course_id is not null and public.manages_course(course_id)));
create policy videos_insert on public.video_assets for insert to authenticated
  with check ((public.is_super_admin() or public.is_content_manager()) and uploaded_by = auth.uid()
              and (course_id is null or public.manages_course(course_id)));
create policy videos_update on public.video_assets for update to authenticated
  using (public.is_super_admin() or (course_id is not null and public.manages_course(course_id)))
  with check (public.is_super_admin() or (course_id is not null and public.manages_course(course_id)));

-- revisions & approvals
create policy revisions_read on public.content_revisions for select to authenticated
  using (public.manages_course(course_id));
create policy revisions_insert on public.content_revisions for insert to authenticated
  with check (public.manages_course(course_id) and author_id = auth.uid() and status in ('DRAFT', 'REVIEW'));
create policy revisions_update on public.content_revisions for update to authenticated
  using (public.is_super_admin() or (author_id = auth.uid() and status = 'DRAFT'))
  with check (public.is_super_admin() or (author_id = auth.uid() and status in ('DRAFT', 'REVIEW')));

create policy approvals_read on public.approval_requests for select to authenticated
  using (public.is_super_admin() or requested_by = auth.uid() or public.manages_course(course_id));
create policy approvals_insert on public.approval_requests for insert to authenticated
  with check (public.manages_course(course_id) and requested_by = auth.uid() and status = 'PENDING');
create policy approvals_update on public.approval_requests for update to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

-- live sessions
create policy live_public_read on public.live_sessions for select to anon
  using (status in ('SCHEDULED', 'LIVE') and public.course_is_published(course_id));
create policy live_read on public.live_sessions for select to authenticated
  using ((status in ('SCHEDULED', 'LIVE', 'ENDED') and (public.course_is_published(course_id) or public.is_enrolled(course_id)))
         or public.manages_course(course_id));
create policy live_insert on public.live_sessions for insert to authenticated
  with check (public.is_super_admin()
              or (public.manages_course(course_id) and status = 'PROPOSED' and proposed_by = auth.uid()));
create policy live_update on public.live_sessions for update to authenticated
  using (public.is_super_admin() or (public.manages_course(course_id) and (host_id = auth.uid() or proposed_by = auth.uid())))
  with check (public.is_super_admin() or public.manages_course(course_id));
create policy live_delete on public.live_sessions for delete to authenticated using (public.is_super_admin());

create policy attendance_read on public.attendance for select to authenticated
  using (user_id = auth.uid() or exists (
    select 1 from public.live_sessions s where s.id = live_session_id and public.manages_course(s.course_id)));

create policy live_msg_read on public.live_session_messages for select to authenticated
  using (public.can_join_live(live_session_id));
create policy live_msg_insert on public.live_session_messages for insert to authenticated
  with check (user_id = auth.uid() and public.can_join_live(live_session_id));

-- commerce: students read their own records; writes happen only in verified server code.
create policy coupons_admin on public.coupons for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());
create policy orders_read on public.orders for select to authenticated
  using (user_id = auth.uid() or public.is_super_admin());
create policy payments_read on public.payments for select to authenticated
  using (user_id = auth.uid() or public.is_super_admin());
create policy refunds_read on public.refunds for select to authenticated
  using (user_id = auth.uid() or public.is_super_admin());

-- enrollments: no self-insert. Created by server after free/paid/invitation checks.
create policy enrollments_read on public.enrollments for select to authenticated
  using (user_id = auth.uid() or public.manages_course(course_id));
create policy enrollments_admin_update on public.enrollments for update to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

create policy progress_read on public.lesson_progress for select to authenticated
  using (user_id = auth.uid() or public.manages_course(course_id));
create policy progress_insert on public.lesson_progress for insert to authenticated
  with check (user_id = auth.uid() and public.is_enrolled(course_id)
              and exists (select 1 from public.lessons l where l.id = lesson_id and l.course_id = course_id));
create policy progress_update on public.lesson_progress for update to authenticated
  using (user_id = auth.uid() and public.is_enrolled(course_id))
  with check (user_id = auth.uid() and public.is_enrolled(course_id));

-- invitations
create policy invitations_read on public.invitations for select to authenticated
  using (public.is_super_admin() or (created_by = auth.uid() and course_id is not null and public.manages_course(course_id)));
create policy invitations_insert on public.invitations for insert to authenticated
  with check (created_by = auth.uid() and (public.is_super_admin()
              or (course_id is not null and public.manages_course(course_id) and not grants_complimentary)));
create policy invitations_update on public.invitations for update to authenticated
  using (public.is_super_admin() or created_by = auth.uid())
  with check (public.is_super_admin() or (created_by = auth.uid() and not grants_complimentary));
create policy redemptions_read on public.invitation_redemptions for select to authenticated
  using (user_id = auth.uid() or public.is_super_admin());

-- assessment
create policy quizzes_read on public.quizzes for select to authenticated
  using (public.manages_course(course_id) or (is_published and public.is_enrolled(course_id)));
create policy quizzes_write on public.quizzes for all to authenticated
  using (public.manages_course(course_id)) with check (public.manages_course(course_id));
-- answer keys are never readable by students (they receive sanitized questions from the server)
create policy questions_staff on public.questions for all to authenticated
  using (exists (select 1 from public.quizzes q where q.id = quiz_id and public.manages_course(q.course_id)))
  with check (exists (select 1 from public.quizzes q where q.id = quiz_id and public.manages_course(q.course_id)));
create policy attempts_read on public.quiz_attempts for select to authenticated
  using (user_id = auth.uid() or exists (select 1 from public.quizzes q where q.id = quiz_id and public.manages_course(q.course_id)));

create policy assignments_read on public.assignments for select to authenticated
  using (public.manages_course(course_id) or public.is_enrolled(course_id));
create policy assignments_write on public.assignments for all to authenticated
  using (public.manages_course(course_id)) with check (public.manages_course(course_id));
create policy submissions_read on public.submissions for select to authenticated
  using (user_id = auth.uid() or exists (select 1 from public.assignments a where a.id = assignment_id and public.manages_course(a.course_id)));
create policy submissions_insert on public.submissions for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.assignments a where a.id = assignment_id and public.is_enrolled(a.course_id)));
create policy submissions_update on public.submissions for update to authenticated
  using ((user_id = auth.uid() and status = 'SUBMITTED')
         or exists (select 1 from public.assignments a where a.id = assignment_id and public.manages_course(a.course_id)))
  with check (user_id = auth.uid()
         or exists (select 1 from public.assignments a where a.id = assignment_id and public.manages_course(a.course_id)));

create policy certificates_read on public.certificates for select to authenticated
  using (user_id = auth.uid() or public.is_super_admin());
create policy certificates_admin on public.certificates for update to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

-- platform
create policy notifications_read on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notifications_delete on public.notifications for delete to authenticated using (user_id = auth.uid());
create policy audit_read on public.audit_logs for select to authenticated using (public.is_super_admin());
create policy outbox_read on public.email_outbox for select to authenticated using (public.is_super_admin());
create policy settings_admin on public.platform_settings for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());
create policy contact_admin on public.contact_messages for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());
create policy data_requests_read on public.data_requests for select to authenticated
  using (user_id = auth.uid() or public.is_super_admin());
create policy data_requests_insert on public.data_requests for insert to authenticated
  with check (user_id = auth.uid() and status = 'PENDING');
create policy data_requests_admin on public.data_requests for update to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

-- ── column guards ───────────────────────────────────────────────────────────
create or replace function public.guard_profiles() returns trigger
language plpgsql set search_path = '' as $$
begin
  if public.in_request_context() and not public.is_super_admin() then
    if new.email is distinct from old.email or new.session_version is distinct from old.session_version
       or new.is_disabled is distinct from old.is_disabled or new.deleted_at is distinct from old.deleted_at then
      raise exception 'not allowed to change protected profile fields' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create trigger profiles_guard before update on public.profiles for each row execute function public.guard_profiles();

create or replace function public.guard_courses() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not public.in_request_context() or public.is_super_admin() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.status <> 'DRAFT' or new.published_at is not null or new.is_demo then
      raise exception 'content managers can only create draft courses' using errcode = '42501';
    end if;
    -- pricing is decided by the Super Admin: new CM courses start free/unpriced
    if not new.is_free or new.price_paise <> 0 or new.compare_at_price_paise is not null then
      raise exception 'content managers cannot set prices' using errcode = '42501';
    end if;
    return new;
  end if;
  if new.price_paise is distinct from old.price_paise or new.is_free is distinct from old.is_free
     or new.compare_at_price_paise is distinct from old.compare_at_price_paise or new.currency is distinct from old.currency then
    raise exception 'content managers cannot modify pricing' using errcode = '42501';
  end if;
  if new.created_by is distinct from old.created_by or new.is_demo is distinct from old.is_demo
     or new.published_at is distinct from old.published_at or new.archived_at is distinct from old.archived_at then
    raise exception 'protected course fields' using errcode = '42501';
  end if;
  if new.status is distinct from old.status and not (
       (old.status = 'DRAFT' and new.status = 'REVIEW') or
       (old.status = 'REJECTED' and new.status in ('DRAFT', 'REVIEW'))) then
    raise exception 'content managers cannot change course status to %', new.status using errcode = '42501';
  end if;
  return new;
end $$;
create trigger courses_guard before insert or update on public.courses for each row execute function public.guard_courses();

-- a Content Manager who creates a course is automatically assigned to it
create or replace function public.assign_course_creator() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.created_by is not null and exists (
       select 1 from public.user_roles where user_id = new.created_by and role = 'CONTENT_MANAGER') then
    insert into public.content_manager_assignments (user_id, course_id, assigned_by)
    values (new.created_by, new.id, new.created_by) on conflict do nothing;
  end if;
  return new;
end $$;
create trigger courses_assign_creator after insert on public.courses for each row execute function public.assign_course_creator();

create or replace function public.guard_live_sessions() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not public.in_request_context() or public.is_super_admin() then return new; end if;
  if new.host_id is distinct from old.host_id or new.course_id is distinct from old.course_id
     or new.provider is distinct from old.provider or new.is_demo is distinct from old.is_demo then
    raise exception 'protected live session fields' using errcode = '42501';
  end if;
  -- hosts may start/end an approved class; proposers may edit or withdraw a proposal
  if new.status is distinct from old.status and not (
       (old.status = 'SCHEDULED' and new.status = 'LIVE' and old.host_id = auth.uid()) or
       (old.status = 'LIVE' and new.status = 'ENDED' and old.host_id = auth.uid()) or
       (old.status = 'PROPOSED' and new.status = 'CANCELLED' and old.proposed_by = auth.uid())) then
    raise exception 'not allowed to change live session status' using errcode = '42501';
  end if;
  if old.status <> 'PROPOSED' and (new.starts_at is distinct from old.starts_at or new.duration_minutes is distinct from old.duration_minutes) then
    raise exception 'approved sessions can only be rescheduled by a Super Admin' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger live_sessions_guard before update on public.live_sessions for each row execute function public.guard_live_sessions();

create or replace function public.guard_invitations() returns trigger
language plpgsql set search_path = '' as $$
begin
  if public.in_request_context() and not public.is_super_admin() and new.grants_complimentary then
    raise exception 'only a Super Admin can grant complimentary access' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and public.in_request_context() and not public.is_super_admin()
     and (new.token_hash is distinct from old.token_hash or new.use_count is distinct from old.use_count) then
    raise exception 'protected invitation fields' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger invitations_guard before insert or update on public.invitations for each row execute function public.guard_invitations();

create or replace function public.guard_submissions() returns trigger
language plpgsql set search_path = '' as $$
declare staff boolean;
begin
  if not public.in_request_context() then return new; end if;
  select public.manages_course(a.course_id) into staff from public.assignments a where a.id = new.assignment_id;
  if coalesce(staff, false) then
    if tg_op = 'UPDATE' and (new.text_answer is distinct from old.text_answer or new.link_url is distinct from old.link_url
       or new.file_key is distinct from old.file_key or new.user_id is distinct from old.user_id) then
      raise exception 'graders cannot alter a submission' using errcode = '42501';
    end if;
    return new;
  end if;
  if new.points is not null or new.graded_by is not null or new.graded_at is not null
     or new.feedback is not null or new.status <> 'SUBMITTED' then
    raise exception 'students cannot grade submissions' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger submissions_guard before insert or update on public.submissions for each row execute function public.guard_submissions();

create or replace function public.guard_revisions() returns trigger
language plpgsql set search_path = '' as $$
begin
  if public.in_request_context() and not public.is_super_admin()
     and (new.status in ('APPROVED', 'APPLIED') or new.reviewer_id is not null or new.applied_at is not null) then
    raise exception 'only a Super Admin can approve revisions' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger revisions_guard before insert or update on public.content_revisions for each row execute function public.guard_revisions();

create or replace function public.guard_notifications() returns trigger
language plpgsql set search_path = '' as $$
begin
  if public.in_request_context() and (new.title is distinct from old.title or new.body is distinct from old.body
      or new.user_id is distinct from old.user_id or new.kind is distinct from old.kind or new.link is distinct from old.link) then
    raise exception 'notifications can only be marked read' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger notifications_guard before update on public.notifications for each row execute function public.guard_notifications();
