-- Display names for live-class chat/participants without exposing other students' profiles.
-- Returns "First L." only, and only to people allowed to join that session.
create or replace function public.live_display_names(sid uuid)
returns table (user_id uuid, display_name text, active boolean)
language sql stable security definer set search_path = '' as $$
  select p.id,
         coalesce(nullif(split_part(trim(p.full_name), ' ', 1), ''), 'Student') ||
           case when position(' ' in trim(p.full_name)) > 0
                then ' ' || left(reverse(split_part(reverse(trim(p.full_name)), ' ', 1)), 1) || '.' else '' end,
         exists (select 1 from public.attendance a where a.live_session_id = sid and a.user_id = p.id
                 and a.last_seen_at > now() - interval '75 seconds' and a.left_at is null)
  from public.profiles p
  where public.can_join_live(sid)
    and p.id in (select m.user_id from public.live_session_messages m where m.live_session_id = sid
                 union select a.user_id from public.attendance a where a.live_session_id = sid)
$$;
revoke all on function public.live_display_names(uuid) from public;
grant execute on function public.live_display_names(uuid) to authenticated;
