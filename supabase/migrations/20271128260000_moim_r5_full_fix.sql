-- Moim R5 full fix (2026-11-28). Design: docs/audit/moim-r5-full-fix-design-2026-11-28.md
-- + docs/audit/moim-r5-design-2026-11-28/INTEGRATED.md (final). One transaction (the runner wraps it).
-- Order: backup table -> structure -> new functions (7) -> changed functions (37) -> data repairs -> grants.
-- Function bodies are ASCII only. Every changed function starts from its latest definition.
-- Rollback: docs/audit/moim-r5-backup-definitions-2026-11-28.sql (made from production right before apply).

-- ===== 0. backup table (delete after 2026-12-28)
create table if not exists public.moim_r5_backup_20271128 (
  tbl text not null,
  row_id uuid not null,
  row_data jsonb not null,
  backed_up_at timestamptz not null default now(),
  primary key (tbl, row_id)
);
alter table public.moim_r5_backup_20271128 enable row level security;
revoke all on table public.moim_r5_backup_20271128 from public, anon, authenticated;
grant all on table public.moim_r5_backup_20271128 to service_role;

-- ===== 1. structure
-- E1: open-report dedupe is per moim (create the new index first, then drop the old one)
create unique index if not exists moim_reports_open_dedupe_moim_uidx
  on public.moim_reports (reporter_id, moim_id, target_type, target_id) where status in ('received', 'reviewing');
drop index if exists public.moim_reports_open_dedupe_uidx;

-- E3: who placed the ban (only a platform admin can lift an admin ban)
alter table public.moim_bans add column if not exists source text not null default 'moim';
alter table public.moim_bans drop constraint if exists moim_bans_source_check;
alter table public.moim_bans add constraint moim_bans_source_check check (source in ('moim', 'admin'));

-- ===== 1b. read-only view for the admin sanction list (lead decision 1: state is read, never synced)
create or replace view public.moim_admin_sanction_rows_v with (security_invoker = true) as
select s.*,
       r.target_type as report_target_type,
       cs.id as community_sanction_id,
       cs.end_at as cs_end_at,
       cs.revoked_at as cs_revoked_at,
       cn.content_now,
       case
         when s.target_kind = 'moim' then
           case when s.revoked_at is not null then 'revoked'
                when s.ends_at is not null and s.ends_at <= now() then 'expired'
                else 'active' end
         when s.level = 'user_restrict' then
           case when cs.id is null then 'unlinked'
                when cs.revoked_at is not null then 'revoked'
                when cs.end_at is not null and cs.end_at <= now() then 'expired'
                else 'active' end
         else
           case when s.revoked_at is not null then 'revoked'
                when cn.content_now in ('hidden', 'deleted', 'cancelled') then 'active'
                else 'lifted' end
       end as live_state
  from public.moim_sanctions s
  left join public.moim_reports r on r.id = s.source_report_id
  left join lateral (
    select x.id, x.end_at, x.revoked_at from public.sanctions x
     where s.level = 'user_restrict' and x.source_report_kind = 'moim'
       and x.source_report_id = s.source_report_id and x.user_id = s.target_id
     order by x.created_at desc limit 1) cs on true
  left join lateral (
    select case when s.target_kind <> 'content' then null
                when r.target_type = 'post' then (select p.status from public.moim_posts p where p.id = s.target_id)
                when r.target_type = 'comment' then (select c.status from public.moim_comments c where c.id = s.target_id)
                when r.target_type = 'album' then (select a.status from public.moim_album_items a where a.id = s.target_id)
                when r.target_type = 'schedule' then (select sc.status from public.moim_schedules sc where sc.id = s.target_id)
                when r.target_type = 'chat_message' then (select case when coalesce(msg.is_hidden_by_admin, false) then 'hidden' else 'active' end
                                                              from public.community_messenger_messages msg where msg.id = s.target_id)
           end as content_now) cn on true;
revoke all on table public.moim_admin_sanction_rows_v from public, anon, authenticated;
grant select on table public.moim_admin_sanction_rows_v to service_role;

-- ===== 2. new functions (7)
-- N1 (E12): one image URL rule (same as post photos: https, at most 1000 chars). null passes.
create or replace function public.moim__assert_image_url(p_url text)
 returns void
 language plpgsql
 immutable
 set search_path to 'public'
as $function$
begin
  if p_url is null then return; end if;
  if p_url !~ '^https://[^\s]+$' or char_length(p_url) > 1000 then
    perform public.moim__fail('moim_image_url_invalid');
  end if;
end
$function$;

-- N2 (C17): birth years 1900..this year, min <= max
create or replace function public.moim__assert_birth_years(p_min integer, p_max integer)
 returns void
 language plpgsql
 stable
 set search_path to 'public'
as $function$
declare v_now int := extract(year from now())::int;
begin
  if (p_min is not null and (p_min < 1900 or p_min > v_now))
     or (p_max is not null and (p_max < 1900 or p_max > v_now))
     or (p_min is not null and p_max is not null and p_min > p_max) then
    perform public.moim__fail('moim_age_range_invalid');
  end if;
end
$function$;

-- N4 (D4/D10/D11): moim state gate for admin actions. The caller takes the row lock first.
create or replace function public.moim__admin_assert_state(p_moim uuid, p_need text)
 returns void
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $function$
declare v_status text;
begin
  if p_need not in ('active', 'not_deleted') then perform public.moim__fail('moim_content_action_invalid'); end if;
  select status into v_status from public.moims where id = p_moim;
  if v_status is null then perform public.moim__fail('moim_not_found'); end if;
  if v_status = 'deleted' then perform public.moim__fail('moim_deleted'); end if;
  if p_need = 'active' and v_status = 'closed' then perform public.moim__fail('moim_closed'); end if;
end
$function$;

-- N6 (A18): messenger room -> moim id (main room = moim, schedule room = schedule's moim)
create or replace function public.moim__room_moim_id(p_room uuid)
 returns uuid
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select coalesce(
           (select m.id from public.moims m where m.id = r.owner_ref_id),
           (select s.moim_id from public.moim_schedules s where s.id = r.owner_ref_id))
    from public.community_messenger_rooms r
   where r.id = p_room and r.owner_domain = 'moim';
$function$;

-- N3 (C5): the sender cancels the direct handover request they see (never an inactive request)
create or replace function public.moim_host_transfer_cancel(p_actor uuid, p_transfer uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_moim uuid;
  v_to uuid;
begin
  update public.moim_host_transfers set status = 'cancelled', decided_at = now()
   where id = p_transfer and kind = 'direct' and status = 'requested' and from_user_id = p_actor
  returning moim_id, to_user_id into v_moim, v_to;
  if v_moim is null then perform public.moim__fail('moim_transfer_not_found'); end if;
  perform public.moim__log(v_moim, p_actor, 'user', 'host_transfer_cancelled', v_to, jsonb_build_object('transfer_id', p_transfer));
  return jsonb_build_object('ok', true, 'transfer_id', p_transfer, 'moim_id', v_moim, 'to_user_id', v_to);
end
$function$;

-- N5 (D23): messenger admin message hide/unhide in a moim room is written to the moim admin log only
create or replace function public.moim_admin_log_room_action(p_admin uuid, p_room uuid, p_type text, p_target uuid, p_reason text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_moim uuid := public.moim__room_moim_id(p_room);
begin
  if v_moim is null then return jsonb_build_object('ok', false, 'error', 'moim_room_not_moim'); end if;
  if p_type not in ('admin_messenger_message_hidden', 'admin_messenger_message_unhidden') then
    perform public.moim__fail('moim_content_action_invalid');
  end if;
  perform public.moim__admin_log(v_moim, p_admin, p_type, p_target, left(nullif(btrim(coalesce(p_reason, '')), ''), 500),
    null, jsonb_build_object('room_id', p_room));
  return jsonb_build_object('ok', true, 'moim_id', v_moim);
end
$function$;

-- N7 (C4): save the order of the open boards (the array must be exactly the open board set)
create or replace function public.moim_board_reorder(p_actor uuid, p_moim uuid, p_board_ids uuid[])
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_n int := coalesce(cardinality(p_board_ids), 0);
begin
  if not public.moim_actor_can(p_moim, p_actor, 'manage_boards') then perform public.moim__fail('moim_forbidden'); end if;
  perform 1 from public.moim_boards where moim_id = p_moim for update;
  if v_n = 0 or array_position(p_board_ids, null) is not null
     or (select count(distinct x) from unnest(p_board_ids) x) <> v_n
     or (select array_agg(id order by id) from public.moim_boards where moim_id = p_moim and is_active)
        is distinct from (select array_agg(x order by x) from unnest(p_board_ids) x) then
    perform public.moim__fail('moim_board_order_invalid');
  end if;
  update public.moim_boards b set sort_order = o.ord
    from unnest(p_board_ids) with ordinality as o(id, ord)
   where b.id = o.id and b.moim_id = p_moim;
  update public.moim_boards b set sort_order = v_n + c.rn
    from (select id, row_number() over (order by sort_order, id) as rn
            from public.moim_boards where moim_id = p_moim and not is_active) c
   where b.id = c.id;
  perform public.moim__log(p_moim, p_actor, 'user', 'board_reordered', null, jsonb_build_object('board_ids', to_jsonb(p_board_ids)));
  return jsonb_build_object('ok', true);
end
$function$;

-- ===== 3. changed functions (37) -- latest definitions + the R5 lines only

-- moim_admin_report_decide
CREATE OR REPLACE FUNCTION public.moim_admin_report_decide(p_admin uuid, p_report uuid, p_expected_status text, p_decision text, p_reason text, p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_reason text := public.moim__admin_reason(p_reason);
  v_r record;
  v_m record;
  v_hide boolean := coalesce((p->>'content_hide')::boolean, false);
  v_level text := nullif(p->>'moim_level', '');
  v_ends timestamptz := nullif(p->>'moim_ends_at', '')::timestamptz;
  v_ur jsonb := case when jsonb_typeof(p->'user_restrict') = 'object' then p->'user_restrict' else null end;
  v_close boolean := coalesce((p->>'close_same_target')::boolean, false);
  v_owner uuid;
  v_status text;
  v_first_sanction uuid;
  v_sid uuid;
  v_actions jsonb := '[]'::jsonb;
  v_chat_room uuid;
  v_sched record;
  v_sched_title text;
  v_sched_users jsonb;
  v_restrict_user uuid;
  v_restrict jsonb;
  v_days int;
  v_reporters jsonb;
  v_closed jsonb;
  v_state text;
  v_changed boolean := false;
  v_created boolean;
begin
  if p_decision not in ('actioned', 'dismissed') then perform public.moim__fail('moim_report_decision_invalid'); end if;
  if p_decision = 'dismissed' and (v_hide or v_level is not null or v_ur is not null) then perform public.moim__fail('moim_report_decision_invalid'); end if;
  if p_decision = 'actioned' and not (v_hide or v_level is not null or v_ur is not null) then perform public.moim__fail('moim_report_decision_invalid'); end if;
  if v_level is not null and v_level not in ('unlist', 'warn', 'block') then perform public.moim__fail('moim_sanction_level_invalid'); end if;
  if v_ends is not null and (v_level is null or v_ends <= now()) then perform public.moim__fail('moim_sanction_period_invalid'); end if;
  if v_level in ('warn', 'block') and v_ends is not null then perform public.moim__fail('moim_sanction_period_not_allowed'); end if;
  select * into v_r from public.moim_reports where id = p_report for update;
  if not found then perform public.moim__fail('moim_report_not_found'); end if;
  if v_r.status not in ('received', 'reviewing') or v_r.status is distinct from p_expected_status then perform public.moim__fail('moim_conflict'); end if;
  select * into v_m from public.moims where id = v_r.moim_id for update;
  if v_m.status = 'deleted' and (v_hide or v_level is not null) then perform public.moim__fail('moim_deleted'); end if;
  v_owner := case v_r.target_type
    when 'member' then v_r.target_id
    when 'moim' then v_m.host_user_id
    when 'post' then (select author_id from public.moim_posts where id = v_r.target_id)
    when 'comment' then (select author_id from public.moim_comments where id = v_r.target_id)
    when 'album' then (select uploader_id from public.moim_album_items where id = v_r.target_id)
    when 'schedule' then (select host_user_id from public.moim_schedules where id = v_r.target_id)
    when 'chat_message' then (select sender_id from public.community_messenger_messages where id = v_r.target_id)
  end;
  if v_hide then
    if v_r.target_type in ('moim', 'member') then perform public.moim__fail('moim_report_decision_invalid'); end if;
    if v_r.target_type = 'post' then
      update public.moim_posts set status = 'hidden', is_pinned = false, hidden_by = p_admin, hidden_reason = v_reason, updated_at = now()
       where id = v_r.target_id and status = 'active';
      v_changed := found;
    elsif v_r.target_type = 'comment' then
      update public.moim_comments set status = 'hidden', updated_at = now() where id = v_r.target_id and status = 'active';
      v_changed := found;
      if found then
        update public.moim_posts set comment_count = greatest(comment_count - 1, 0)
         where id = (select post_id from public.moim_comments where id = v_r.target_id);
      end if;
    elsif v_r.target_type = 'album' then
      update public.moim_album_items set status = 'hidden', is_pinned = false where id = v_r.target_id and status = 'active';
      v_changed := found;
    elsif v_r.target_type = 'schedule' then
      select * into v_sched from public.moim_schedules where id = v_r.target_id for update;
      if found and v_sched.status in ('recruiting', 'full', 'closed') then
        v_sched_title := v_sched.title;
        v_changed := true;
        select coalesce(jsonb_agg(user_id), '[]'::jsonb) into v_sched_users
          from public.moim_schedule_participants where schedule_id = v_sched.id and status = 'confirmed';
        update public.moim_schedules set status = 'cancelled', finished_at = now(), updated_at = now() where id = v_sched.id;
        if v_sched.room_id is not null then
          perform public.moim__writer_on();
          update public.community_messenger_rooms set is_readonly = true, updated_at = now() where id = v_sched.room_id;
        end if;
      end if;
    elsif v_r.target_type = 'chat_message' then
      update public.community_messenger_messages set is_hidden_by_admin = true
       where id = v_r.target_id and coalesce(is_hidden_by_admin, false) = false
      returning room_id into v_chat_room;
      v_changed := v_chat_room is not null;
    end if;
    -- new2: a content_hide row only when the content changed now; otherwise point at the latest one
    v_sid := null;
    if v_changed then
      insert into public.moim_sanctions (moim_id, target_kind, target_id, level, reason_code, reason, source_report_id, actor_id)
      values (v_r.moim_id, 'content', v_r.target_id, 'content_hide', v_r.reason_code, v_reason, p_report, p_admin)
      returning id into v_sid;
    else
      select s.id into v_sid from public.moim_sanctions s
       where s.target_kind = 'content' and s.target_id = v_r.target_id and s.level = 'content_hide' and s.revoked_at is null
       order by s.created_at desc limit 1;
    end if;
    v_first_sanction := coalesce(v_first_sanction, v_sid);
    v_actions := v_actions || jsonb_build_object('kind', 'content_hide', 'sanction_id', v_sid, 'changed', v_changed);
  end if;
  if v_level is not null then
    -- D3: reuse an active same-level moim sanction instead of inserting a second one
    v_sid := null;
    select s.id into v_sid from public.moim_sanctions s
     where s.moim_id = v_r.moim_id and s.target_kind = 'moim' and s.level = v_level
       and s.revoked_at is null and s.starts_at <= now() and (s.ends_at is null or s.ends_at > now())
     order by s.created_at limit 1;
    v_created := v_sid is null;
    if v_created then
      insert into public.moim_sanctions (moim_id, target_kind, target_id, level, reason_code, reason, source_report_id, actor_id, ends_at)
      values (v_r.moim_id, 'moim', v_r.moim_id, v_level, v_r.reason_code, v_reason, p_report, p_admin, v_ends)
      returning id into v_sid;
    end if;
    v_first_sanction := coalesce(v_first_sanction, v_sid);
    v_state := public.moim__platform_refresh(v_r.moim_id);
    v_actions := v_actions || jsonb_build_object('kind', 'moim_' || v_level, 'sanction_id', v_sid, 'platform_state', v_state, 'created', v_created);
  end if;
  if v_ur is not null then
    v_restrict_user := case v_ur->>'who' when 'host' then v_m.host_user_id when 'target' then v_owner else null end;
    if v_restrict_user is null then perform public.moim__fail('moim_report_decision_invalid'); end if;
    if char_length(v_reason) < 2 then perform public.moim__fail('moim_admin_reason_required'); end if;
    v_days := nullif(v_ur->>'days', '')::int;
    v_restrict := public.admin_apply_community_sanction(
      v_restrict_user, 'community_restriction', v_ur->>'restriction', v_days, v_reason, p_admin, p_report, 'moim');
    if coalesce((v_restrict->>'ok')::boolean, false) is not true then perform public.moim__fail('moim_user_restrict_failed'); end if;
    -- an existing community restriction was reused: no second moim row, point at the active one
    v_sid := null;
    if coalesce((v_restrict->>'duplicate')::boolean, false) then
      select s.id into v_sid from public.moim_sanctions s
       where s.target_id = v_restrict_user and s.level = 'user_restrict' and s.revoked_at is null
         and (s.ends_at is null or s.ends_at > now()) and s.moim_id = v_r.moim_id
       order by s.created_at desc limit 1;
    end if;
    -- a reused restriction with no row in this moim yet still gets this moim's row (never point at another moim's row)
    if v_sid is null then
      insert into public.moim_sanctions (moim_id, target_kind, target_id, level, reason_code, reason, source_report_id, actor_id, ends_at)
      values (v_r.moim_id, case when v_restrict_user = v_m.host_user_id then 'host' else 'member' end, v_restrict_user, 'user_restrict',
              v_r.reason_code, v_reason, p_report, p_admin,
              (select end_at from public.sanctions where id = nullif(v_restrict->>'id', '')::uuid))
      returning id into v_sid;
    end if;
    v_first_sanction := coalesce(v_first_sanction, v_sid);
    v_actions := v_actions || jsonb_build_object('kind', 'user_restrict', 'sanction_id', v_sid, 'user_id', v_restrict_user,
      'community_sanction_id', v_restrict->>'id', 'duplicate', coalesce((v_restrict->>'duplicate')::boolean, false),
      'restriction', v_ur->>'restriction', 'days', v_days, 'end_at', v_restrict->>'end_at');
  end if;
  with u as (
    update public.moim_reports
       set status = p_decision, action_id = v_first_sanction, handled_by = p_admin, handled_at = now()
     where id = p_report
        or (v_close and moim_id = v_r.moim_id and target_type = v_r.target_type and target_id = v_r.target_id
            and status in ('received', 'reviewing'))
    returning id, reporter_id
  )
  select coalesce(jsonb_agg(id), '[]'::jsonb), coalesce(jsonb_agg(distinct reporter_id), '[]'::jsonb) into v_closed, v_reporters from u;
  perform public.moim__admin_log(v_r.moim_id, p_admin, 'admin_report_' || p_decision, p_report, v_reason,
    jsonb_build_object('status', v_r.status), jsonb_build_object('status', p_decision, 'actions', v_actions, 'closed_report_ids', v_closed));
  return jsonb_build_object(
    'ok', true, 'status', p_decision, 'moim_id', v_r.moim_id, 'moim_name', v_m.name, 'host_user_id', v_m.host_user_id,
    'target_type', v_r.target_type, 'target_id', v_r.target_id, 'target_owner_id', v_owner,
    'reporter_ids', v_reporters, 'closed_report_ids', v_closed, 'actions', v_actions,
    'moim_level', v_level,
    'moim_notify_user_ids', case when v_m.status <> 'active' then '[]'::jsonb
                                 when v_level = 'block' then public.moim__active_member_ids(v_r.moim_id)
                                 when v_level is not null then jsonb_build_array(v_m.host_user_id) else '[]'::jsonb end,
    'chat_room_id', v_chat_room,
    'schedule_title', v_sched_title, 'schedule_notify_user_ids', coalesce(v_sched_users, '[]'::jsonb),
    'moim_status', v_m.status, 'retention_ended_at', v_m.retention_ended_at,
    'reporter_member_ids', (select coalesce(jsonb_agg(mm.user_id), '[]'::jsonb) from public.moim_members mm
                             where mm.moim_id = v_r.moim_id and mm.status = 'active'
                               and mm.user_id in (select x::uuid from jsonb_array_elements_text(v_reporters) x))
  );
end
$function$;

-- moim_admin_sanction_apply
CREATE OR REPLACE FUNCTION public.moim_admin_sanction_apply(p_admin uuid, p_moim uuid, p_level text, p_reason_code text, p_reason text, p_ends_at timestamp with time zone, p_report uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_reason text := public.moim__admin_reason(p_reason);
  v_m record;
  v_id uuid;
  v_state text;
begin
  if p_level not in ('unlist', 'warn', 'block') then perform public.moim__fail('moim_sanction_level_invalid'); end if;
  if not public.moim__report_reason_active(p_reason_code) then perform public.moim__fail('moim_report_reason_invalid'); end if;
  if p_level in ('warn', 'block') and p_ends_at is not null then perform public.moim__fail('moim_sanction_period_not_allowed'); end if;
  if p_ends_at is not null and p_ends_at <= now() then perform public.moim__fail('moim_sanction_period_invalid'); end if;
  select * into v_m from public.moims where id = p_moim for update;
  perform public.moim__admin_assert_state(p_moim, 'not_deleted');
  if exists (select 1 from public.moim_sanctions s where s.moim_id = p_moim and s.target_kind = 'moim' and s.level = p_level
               and s.revoked_at is null and s.starts_at <= now() and (s.ends_at is null or s.ends_at > now())) then
    perform public.moim__fail('moim_sanction_already_active');
  end if;
  -- E11: only an open report of this moim can be linked; the report status is not changed here (D-18)
  if p_report is not null and not exists (select 1 from public.moim_reports r where r.id = p_report and r.moim_id = p_moim
                                             and r.status in ('received', 'reviewing')) then
    perform public.moim__fail('moim_report_link_invalid');
  end if;
  insert into public.moim_sanctions (moim_id, target_kind, target_id, level, reason_code, reason, actor_id, ends_at, source_report_id)
  values (p_moim, 'moim', p_moim, p_level, p_reason_code, v_reason, p_admin, p_ends_at, p_report)
  returning id into v_id;
  v_state := public.moim__platform_refresh(p_moim);
  perform public.moim__admin_log(p_moim, p_admin, 'admin_sanction_applied', v_id, v_reason,
    jsonb_build_object('platform_state', v_m.platform_state),
    jsonb_build_object('platform_state', v_state, 'level', p_level, 'reason_code', p_reason_code, 'ends_at', p_ends_at));
  return jsonb_build_object('ok', true, 'sanction_id', v_id, 'platform_state', v_state, 'host_user_id', v_m.host_user_id,
    'notify_user_ids', case when v_m.status <> 'active' then '[]'::jsonb
                            when p_level = 'block' then public.moim__active_member_ids(p_moim) else jsonb_build_array(v_m.host_user_id) end,
    'name', v_m.name, 'moim_status', v_m.status, 'retention_ended_at', v_m.retention_ended_at);
end
$function$;

-- moim_admin_sanction_revoke
CREATE OR REPLACE FUNCTION public.moim_admin_sanction_revoke(p_admin uuid, p_sanction uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_reason text := public.moim__admin_reason(p_reason);
  v_s record;
  v_before text;
  v_state text;
  v_mstatus text;
  v_ret timestamptz;
begin
  select * into v_s from public.moim_sanctions where id = p_sanction for update;
  if not found then perform public.moim__fail('moim_sanction_not_found'); end if;
  if v_s.target_kind <> 'moim' then perform public.moim__fail('moim_sanction_not_revocable'); end if;
  select platform_state, status, retention_ended_at into v_before, v_mstatus, v_ret from public.moims where id = v_s.moim_id for update;
  perform public.moim__admin_assert_state(v_s.moim_id, 'not_deleted');
  if v_s.revoked_at is not null then perform public.moim__fail('moim_conflict'); end if;
  update public.moim_sanctions set revoked_at = now(), revoked_by = p_admin where id = p_sanction;
  v_state := public.moim__platform_refresh(v_s.moim_id);
  perform public.moim__admin_log(v_s.moim_id, p_admin, 'admin_sanction_revoked', p_sanction, v_reason,
    jsonb_build_object('platform_state', v_before), jsonb_build_object('platform_state', v_state, 'level', v_s.level));
  return jsonb_build_object('ok', true, 'moim_id', v_s.moim_id, 'platform_state', v_state, 'level', v_s.level,
    'name', (select name from public.moims where id = v_s.moim_id),
    'moim_status', v_mstatus, 'retention_ended_at', v_ret,
    'notify_user_ids', case when v_mstatus <> 'active' then '[]'::jsonb
                            when v_s.level = 'block' then public.moim__active_member_ids(v_s.moim_id)
                            else coalesce((select jsonb_build_array(host_user_id) from public.moims where id = v_s.moim_id and host_user_id is not null), '[]'::jsonb) end);
end
$function$;

-- D9: the review start needs a reason (signature change: the old 2-arg function is dropped)
drop function if exists public.moim_admin_report_review(uuid, uuid);
-- moim_admin_report_review
CREATE OR REPLACE FUNCTION public.moim_admin_report_review(p_admin uuid, p_report uuid, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_reason text := public.moim__admin_reason(p_reason);
  v_r record;
begin
  select * into v_r from public.moim_reports where id = p_report for update;
  if not found then perform public.moim__fail('moim_report_not_found'); end if;
  if v_r.status <> 'received' then perform public.moim__fail('moim_conflict'); end if;
  update public.moim_reports set status = 'reviewing', handled_by = p_admin where id = p_report;
  perform public.moim__admin_log(v_r.moim_id, p_admin, 'admin_report_reviewing', p_report, v_reason, jsonb_build_object('status', 'received'), jsonb_build_object('status', 'reviewing'));
  return jsonb_build_object('ok', true);
end
$function$;
revoke all on function public.moim_admin_report_review(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.moim_admin_report_review(uuid, uuid, text) to service_role;

-- moim_admin_content
CREATE OR REPLACE FUNCTION public.moim_admin_content(p_admin uuid, p_type text, p_id uuid, p_action text, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_reason text := public.moim__admin_reason(p_reason);
  v_moim uuid;
  v_status text;
  v_post uuid;
  v_new text;
  v_s record;
  v_users jsonb;
  v_author uuid;
begin
  if p_type = 'schedule' then
    if p_action <> 'cancel' then perform public.moim__fail('moim_content_action_invalid'); end if;
    select * into v_s from public.moim_schedules where id = p_id for update;
    if not found then perform public.moim__fail('moim_content_not_found'); end if;
    perform public.moim__admin_assert_state(v_s.moim_id, 'not_deleted');
    if v_s.status in ('done', 'cancelled') then perform public.moim__fail('moim_schedule_finished'); end if;
    select coalesce(jsonb_agg(user_id), '[]'::jsonb) into v_users
      from public.moim_schedule_participants where schedule_id = p_id and status = 'confirmed';
    update public.moim_schedules set status = 'cancelled', finished_at = now(), updated_at = now() where id = p_id;
    if v_s.room_id is not null then
      perform public.moim__writer_on();
      update public.community_messenger_rooms set is_readonly = true, updated_at = now() where id = v_s.room_id;
    end if;
    perform public.moim__admin_log(v_s.moim_id, p_admin, 'admin_schedule_cancelled', p_id, v_reason, jsonb_build_object('status', v_s.status), null);
    return jsonb_build_object('ok', true, 'moim_id', v_s.moim_id, 'title', v_s.title, 'notify_user_ids', v_users);
  end if;
  if p_action not in ('hide', 'restore', 'delete', 'undelete') then perform public.moim__fail('moim_content_action_invalid'); end if;
  v_new := case p_action when 'hide' then 'hidden' when 'delete' then 'deleted' else 'active' end;
  if p_type = 'post' then
    select moim_id, status, author_id into v_moim, v_status, v_author from public.moim_posts where id = p_id for update;
  elsif p_type = 'comment' then
    select moim_id, status, post_id, author_id into v_moim, v_status, v_post, v_author from public.moim_comments where id = p_id for update;
  elsif p_type = 'album' then
    select moim_id, status, uploader_id into v_moim, v_status, v_author from public.moim_album_items where id = p_id for update;
  else
    perform public.moim__fail('moim_content_action_invalid');
  end if;
  if v_moim is null then perform public.moim__fail('moim_content_not_found'); end if;
  -- D11: a deleted moim is read only for admins too (restore the moim first)
  perform public.moim__admin_assert_state(v_moim, 'not_deleted');
  -- E8: an author's own delete is not undone by an admin
  if p_action = 'undelete' and coalesce((
       select e.actor_kind = 'user' from public.moim_events e
        where e.moim_id = v_moim and e.target_id = p_id
          and e.type in ('post_deleted', 'comment_deleted', 'album_deleted', 'admin_' || p_type || '_delete')
        order by e.created_at desc limit 1), false) then
    perform public.moim__fail('moim_content_author_deleted');
  end if;
  if v_status = v_new or (p_action = 'hide' and v_status <> 'active') or (p_action = 'restore' and v_status <> 'hidden')
     or (p_action = 'undelete' and v_status <> 'deleted') then
    perform public.moim__fail('moim_conflict');
  end if;
  if p_type = 'post' then
    update public.moim_posts
       set status = v_new, is_pinned = case when v_new = 'active' then is_pinned else false end,
           hidden_by = case when v_new = 'hidden' then p_admin when v_new = 'active' then null else hidden_by end,
           hidden_reason = case when v_new = 'hidden' then v_reason when v_new = 'active' then null else hidden_reason end,
           updated_at = now()
     where id = p_id;
  elsif p_type = 'comment' then
    update public.moim_comments set status = v_new, updated_at = now() where id = p_id;
    if v_status = 'active' and v_new <> 'active' then
      update public.moim_posts set comment_count = greatest(comment_count - 1, 0) where id = v_post;
    elsif v_status <> 'active' and v_new = 'active' then
      update public.moim_posts set comment_count = comment_count + 1 where id = v_post;
    end if;
  else
    update public.moim_album_items set status = v_new, is_pinned = case when v_new = 'active' then is_pinned else false end where id = p_id;
  end if;
  perform public.moim__admin_log(v_moim, p_admin, 'admin_' || p_type || '_' || p_action, p_id, v_reason,
    jsonb_build_object('status', v_status), jsonb_build_object('status', v_new));
  return jsonb_build_object('ok', true, 'moim_id', v_moim, 'status', v_new, 'author_id', v_author,
    'name', (select name from public.moims where id = v_moim));
end
$function$;

-- moim_admin_member_remove
CREATE OR REPLACE FUNCTION public.moim_admin_member_remove(p_admin uuid, p_moim uuid, p_user uuid, p_ban boolean, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_reason text := public.moim__admin_reason(p_reason);
  v_t record;
  v_found boolean;
begin
  perform public.moim__admin_assert_state(p_moim, 'not_deleted');
  select role, status into v_t from public.moim_members where moim_id = p_moim and user_id = p_user for update;
  v_found := found;
  if v_found and v_t.status = 'active' and v_t.role = 'host' then perform public.moim__fail('moim_cannot_target_host'); end if;
  if not p_ban and (not v_found or v_t.status not in ('active', 'pending')) then perform public.moim__fail('moim_target_not_member'); end if;
  if p_ban and not exists (select 1 from public.profiles where id = p_user) then perform public.moim__fail('moim_target_not_member'); end if;
  if v_found and (v_t.status in ('active', 'pending') or p_ban) then
    update public.moim_members
       set status = case when p_ban then 'banned' else 'kicked' end, role = 'member',
           left_at = case when v_t.status = 'active' then now() else left_at end,
           decided_by = p_admin, decided_at = now(), updated_at = now()
     where moim_id = p_moim and user_id = p_user;
    update public.moim_join_requests set status = 'rejected', decided_by = p_admin, decided_at = now()
     where moim_id = p_moim and user_id = p_user and status = 'pending';
    if v_t.status = 'active' then perform public.moim__deactivate_member(p_moim, p_user); end if;
  end if;
  if p_ban then
    insert into public.moim_bans (moim_id, user_id, banned_by, reason, source)
    select p_moim, p_user, p_admin, v_reason, 'admin'
     where not exists (select 1 from public.moim_bans where moim_id = p_moim and user_id = p_user and released_at is null);
    -- E3: an open staff ban is taken over by the admin (only an admin can lift it now)
    update public.moim_bans set source = 'admin', banned_by = p_admin, reason = v_reason
     where moim_id = p_moim and user_id = p_user and released_at is null and source = 'moim';
    -- S-6: no invite to this person stays open in this moim
    update public.moim_invite_targets set status = 'cancelled', responded_at = now()
     where moim_id = p_moim and invitee_user_id = p_user and status = 'sent';
  end if;
  perform public.moim__admin_log(p_moim, p_admin, case when p_ban then 'admin_member_banned' else 'admin_member_removed' end, p_user, v_reason,
    case when v_found then jsonb_build_object('role', v_t.role, 'status', v_t.status) else null end, null);
  return jsonb_build_object('ok', true, 'was_active', coalesce(v_found and v_t.status = 'active', false),
    'was_pending', coalesce(v_found and v_t.status = 'pending', false),
    'moim_status', (select status from public.moims where id = p_moim),
    'retention_ended_at', (select retention_ended_at from public.moims where id = p_moim));
end
$function$;

-- moim_admin_member_unban
CREATE OR REPLACE FUNCTION public.moim_admin_member_unban(p_admin uuid, p_moim uuid, p_user uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_reason text := public.moim__admin_reason(p_reason);
  v_id uuid;
begin
  perform public.moim__admin_assert_state(p_moim, 'not_deleted');
  update public.moim_bans set released_at = now(), released_by = p_admin
   where moim_id = p_moim and user_id = p_user and released_at is null returning id into v_id;
  if v_id is null then
    -- D13: already lifted (by someone else) is a conflict, no ban at all is not found
    if exists (select 1 from public.moim_bans where moim_id = p_moim and user_id = p_user) then
      perform public.moim__fail('moim_conflict');
    end if;
    perform public.moim__fail('moim_ban_not_found');
  end if;
  update public.moim_members set status = 'kicked', updated_at = now() where moim_id = p_moim and user_id = p_user and status = 'banned';
  perform public.moim__admin_log(p_moim, p_admin, 'admin_member_unbanned', p_user, v_reason, null, null);
  return jsonb_build_object('ok', true,
    'moim_status', (select status from public.moims where id = p_moim),
    'retention_ended_at', (select retention_ended_at from public.moims where id = p_moim));
end
$function$;

-- moim_admin_member_role
CREATE OR REPLACE FUNCTION public.moim_admin_member_role(p_admin uuid, p_moim uuid, p_user uuid, p_role text, p_reason text, p_expected_role text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_reason text := public.moim__admin_reason(p_reason);
  v_cur text;
begin
  if p_role not in ('co_host', 'staff', 'member') then perform public.moim__fail('moim_role_invalid'); end if;
  perform public.moim__admin_assert_state(p_moim, 'active');
  select role into v_cur from public.moim_members where moim_id = p_moim and user_id = p_user and status = 'active' for update;
  if v_cur is null then perform public.moim__fail('moim_target_not_member'); end if;
  if v_cur = 'host' then perform public.moim__fail('moim_cannot_target_host'); end if;
  if p_expected_role is not null and p_expected_role <> v_cur then perform public.moim__fail('moim_conflict'); end if;
  if v_cur = p_role then return jsonb_build_object('ok', true, 'changed', false); end if;
  if p_role in ('co_host', 'staff') and (
       select case p_role when 'co_host' then max_co_hosts else max_staff end from public.moim_policies where id = 1
     ) <= (select count(*) from public.moim_members where moim_id = p_moim and status = 'active' and role = p_role) then
    perform public.moim__fail('moim_role_limit');
  end if;
  update public.moim_members set role = p_role, role_changed_at = now(), updated_at = now() where moim_id = p_moim and user_id = p_user;
  perform public.moim__sync_member_rooms(p_moim, p_user);
  perform public.moim__admin_log(p_moim, p_admin, 'admin_role_changed', p_user, v_reason, jsonb_build_object('role', v_cur), jsonb_build_object('role', p_role));
  return jsonb_build_object('ok', true, 'changed', true);
end
$function$;

-- moim_admin_assign_host
CREATE OR REPLACE FUNCTION public.moim_admin_assign_host(p_admin uuid, p_moim uuid, p_to uuid, p_reason text, p_expected_host uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_reason text := public.moim__admin_reason(p_reason);
  v_m record;
begin
  select * into v_m from public.moims where id = p_moim for update;
  perform public.moim__admin_assert_state(p_moim, 'active');
  if p_expected_host is not null and p_expected_host is distinct from v_m.host_user_id then perform public.moim__fail('moim_conflict'); end if;
  if p_to = v_m.host_user_id then perform public.moim__fail('moim_cannot_target_host'); end if;
  if not exists (select 1 from public.moim_members where moim_id = p_moim and user_id = p_to and status = 'active') then
    perform public.moim__fail('moim_target_not_member');
  end if;
  perform public.moim__assert_host_swap_cap(p_moim, p_to);
  update public.moim_host_transfers set status = 'cancelled', decided_at = now() where moim_id = p_moim and status = 'requested';
  perform public.moim__host_swap(p_moim, v_m.host_user_id, p_to);
  insert into public.moim_host_transfers (moim_id, from_user_id, to_user_id, kind, status, reason, actor_id, decided_at)
  values (p_moim, v_m.host_user_id, p_to, 'admin', 'done', v_reason, p_admin, now());
  perform public.moim__admin_log(p_moim, p_admin, 'admin_host_assigned', p_to, v_reason,
    jsonb_build_object('host_user_id', v_m.host_user_id), jsonb_build_object('host_user_id', p_to));
  return jsonb_build_object('ok', true, 'moim_id', p_moim, 'from_user_id', v_m.host_user_id, 'notify_user_ids', public.moim__active_member_ids(p_moim));
end
$function$;

-- moim_admin_host_request_decide
CREATE OR REPLACE FUNCTION public.moim_admin_host_request_decide(p_admin uuid, p_transfer uuid, p_approve boolean, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_reason text := public.moim__admin_reason(p_reason);
  v_t record;
  v_m record;
  v_last timestamptz;
begin
  select * into v_t from public.moim_host_transfers where id = p_transfer for update;
  if not found or v_t.kind <> 'inactive_request' or v_t.status <> 'requested' then perform public.moim__fail('moim_transfer_not_found'); end if;
  if not p_approve then
    update public.moim_host_transfers set status = 'declined', decided_at = now() where id = p_transfer;
    perform public.moim__admin_log(v_t.moim_id, p_admin, 'admin_host_request_declined', v_t.to_user_id, v_reason, null, null);
    return jsonb_build_object('ok', true, 'approved', false, 'moim_id', v_t.moim_id, 'requester_id', v_t.actor_id);
  end if;
  select * into v_m from public.moims where id = v_t.moim_id for update;
  perform public.moim__admin_assert_state(v_t.moim_id, 'active');
  if v_m.host_user_id <> v_t.from_user_id then perform public.moim__fail('moim_transfer_stale'); end if;
  select last_login_at into v_last from public.profiles where id = v_m.host_user_id;
  if v_last is not null and v_last > now() - interval '7 days' then perform public.moim__fail('moim_host_recently_active'); end if;
  perform public.moim__assert_host_swap_cap(v_t.moim_id, v_t.to_user_id);
  perform public.moim__host_swap(v_t.moim_id, v_t.from_user_id, v_t.to_user_id);
  update public.moim_host_transfers set status = 'done', decided_at = now() where id = p_transfer;
  perform public.moim__admin_log(v_t.moim_id, p_admin, 'admin_host_request_approved', v_t.to_user_id, v_reason,
    jsonb_build_object('host_user_id', v_t.from_user_id, 'host_last_login_at', v_last), jsonb_build_object('host_user_id', v_t.to_user_id));
  return jsonb_build_object('ok', true, 'approved', true, 'moim_id', v_t.moim_id, 'from_user_id', v_t.from_user_id,
    'to_user_id', v_t.to_user_id, 'requester_id', v_t.actor_id, 'notify_user_ids', public.moim__active_member_ids(v_t.moim_id));
end
$function$;

-- moim_admin_update_info
CREATE OR REPLACE FUNCTION public.moim_admin_update_info(p_admin uuid, p_moim uuid, p jsonb, p_expected_updated_at timestamp with time zone, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_reason text := public.moim__admin_reason(p_reason);
  v_pol public.moim_policies;
  v_word text;
  v_m record;
  v_before jsonb;
  v_name text;
  v_intro text;
  v_cap int;
  v_cat uuid;
  v_room uuid;
  v_q jsonb;
  v_i int := 0;
  v_topic text;
begin
  select * into v_m from public.moims where id = p_moim for update;
  perform public.moim__admin_assert_state(p_moim, 'not_deleted');
  if p_expected_updated_at is null or v_m.updated_at <> p_expected_updated_at then perform public.moim__fail('moim_conflict'); end if;
  v_before := jsonb_build_object('name', v_m.name, 'intro', v_m.intro, 'cover_image_url', v_m.cover_image_url, 'category_id', v_m.category_id, 'topic_label', v_m.topic_label,
    'capacity', v_m.capacity, 'join_mode', v_m.join_mode, 'lgu_id', v_m.lgu_id,
    'questions', (select coalesce(jsonb_agg(question order by sort_order), '[]'::jsonb) from public.moim_join_questions where moim_id = p_moim));
  v_name := case when p ? 'name' then btrim(coalesce(p->>'name', '')) else v_m.name end;
  v_intro := case when p ? 'intro' then btrim(coalesce(p->>'intro', '')) else v_m.intro end;
  -- E20 / D7 / E12: input form checks before any cast
  if p ? 'capacity' and coalesce(p->>'capacity', '') !~ '^([0-9]{1,6})?$' then perform public.moim__fail('moim_capacity_invalid'); end if;
  if p ? 'category_id' and coalesce(p->>'category_id', '') !~* '^([0-9a-f-]{36})?$' then perform public.moim__fail('moim_category_invalid'); end if;
  if p ? 'lgu_id' and btrim(coalesce(p->>'lgu_id', '')) <> '' and btrim(p->>'lgu_id') !~ '^[0-9A-Za-z:_-]{2,40}$' then
    perform public.moim__fail('moim_region_invalid');
  end if;
  if p ? 'cover_image_url' then perform public.moim__assert_image_url(nullif(p->>'cover_image_url', '')); end if;
  v_cap := case when p ? 'capacity' then nullif(p->>'capacity', '')::int else v_m.capacity end;
  v_cat := case when p ? 'category_id' then nullif(p->>'category_id', '')::uuid else v_m.category_id end;
  select * into v_pol from public.moim_policies where id = 1;
  if char_length(v_name) < coalesce(v_pol.name_min_len, 1) or char_length(v_name) > coalesce(v_pol.name_max_len, 60) then perform public.moim__fail('moim_name_length'); end if;
  if char_length(v_intro) > coalesce(v_pol.intro_max_len, 2000) or (v_pol.intro_min_len is not null and char_length(v_intro) < v_pol.intro_min_len) then
    perform public.moim__fail('moim_intro_length');
  end if;
  if v_cap is not null and (v_cap < 2 or v_cap < v_m.member_count or (v_pol.max_capacity is not null and v_cap > v_pol.max_capacity)) then
    perform public.moim__fail('moim_capacity_invalid');
  end if;
  foreach v_word in array coalesce(v_pol.banned_words, '{}') loop
    if v_word <> '' and (position(lower(v_word) in lower(v_name)) > 0 or position(lower(v_word) in lower(v_intro)) > 0) then
      perform public.moim__fail('moim_banned_word');
    end if;
  end loop;
  perform public.moim__assert_questions_clean(p->'questions');
  if v_cat is distinct from v_m.category_id then
    if not exists (select 1 from public.moim_categories where id = v_cat and is_active and not is_restricted) then perform public.moim__fail('moim_category_invalid'); end if;
  elsif not exists (select 1 from public.moim_categories where id = v_cat) then
    perform public.moim__fail('moim_category_invalid');
  end if;
  v_topic := public.moim__topic_resolve(v_cat, case when p ? 'topic_label' then p->>'topic_label' else v_m.topic_label end);
  if p ? 'join_mode' and coalesce(p->>'join_mode', '') not in ('instant', 'approval') then perform public.moim__fail('moim_join_mode_invalid'); end if;
  if p ? 'lgu_id' and btrim(coalesce(p->>'lgu_id', '')) = '' then perform public.moim__fail('moim_region_required'); end if;
  begin
    update public.moims set
      name = v_name, intro = v_intro, capacity = v_cap, category_id = v_cat, topic_label = v_topic,
      cover_image_url = case when p ? 'cover_image_url' then nullif(p->>'cover_image_url', '') else cover_image_url end,
      join_mode = case when p ? 'join_mode' then p->>'join_mode' else join_mode end,
      lgu_id = case when p ? 'lgu_id' then btrim(p->>'lgu_id') else lgu_id end,
      updated_at = now()
    where id = p_moim;
  exception when unique_violation then
    perform public.moim__fail('moim_duplicate');
  end;
  if jsonb_typeof(p->'questions') = 'array' then
    delete from public.moim_join_questions where moim_id = p_moim;
    for v_q in select * from jsonb_array_elements(p->'questions') loop
      if btrim(coalesce(v_q #>> '{}', '')) <> '' then
        v_i := v_i + 1;
        if v_i > 3 then perform public.moim__fail('moim_questions_too_many'); end if;
        insert into public.moim_join_questions (moim_id, sort_order, question) values (p_moim, v_i, left(btrim(v_q #>> '{}'), 200));
      end if;
    end loop;
  end if;
  if v_name <> v_m.name or (p ? 'cover_image_url') then
    perform public.moim__writer_on();
    select main_room_id into v_room from public.moims where id = p_moim;
    if v_room is not null then
      update public.community_messenger_rooms
         set title = left(v_name, 120), avatar_url = (select cover_image_url from public.moims where id = p_moim), updated_at = now()
       where id = v_room;
    end if;
  end if;
  perform public.moim__admin_log(p_moim, p_admin, 'admin_info_updated', p_moim, v_reason, v_before, p);
  return jsonb_build_object('ok', true, 'updated_at', (select updated_at from public.moims where id = p_moim), 'host_user_id', v_m.host_user_id, 'name', v_name,
    'moim_status', v_m.status, 'retention_ended_at', v_m.retention_ended_at);
end
$function$;

-- moim_admin_policies_save
CREATE OR REPLACE FUNCTION public.moim_admin_policies_save(p_admin uuid, p jsonb, p_expected_updated_at timestamp with time zone, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_reason text := public.moim__admin_reason(p_reason);
  v_before public.moim_policies;
  v_key text;
  v_int_keys text[] := array['max_moims_per_user', 'max_capacity', 'max_co_hosts', 'max_staff', 'max_custom_boards', 'max_pinned_notices',
    'join_request_expire_days', 'closed_retention_days', 'schedule_room_archive_days', 'invite_resend_days', 'inactive_unlist_days',
    'name_min_len', 'name_max_len', 'intro_min_len', 'intro_max_len'];
  v_words text[];
  v_qwords text[];
  v_types jsonb;
  v_reasons jsonb;
  v_after public.moim_policies;
  v_bad int;
begin
  select * into v_before from public.moim_policies where id = 1 for update;
  if p_expected_updated_at is null or v_before.updated_at <> p_expected_updated_at then perform public.moim__fail('moim_conflict'); end if;
  for v_key in select jsonb_object_keys(p) loop
    if v_key not in ('banned_words', 'question_banned_words', 'prohibited_types', 'report_reasons') and not (v_key = any(v_int_keys)) then perform public.moim__fail('moim_policy_invalid'); end if;
    if v_key = any(v_int_keys) and jsonb_typeof(p->v_key) not in ('number', 'null') then perform public.moim__fail('moim_policy_invalid'); end if;
  end loop;
  if p ? 'banned_words' then
    if jsonb_typeof(p->'banned_words') <> 'array' then perform public.moim__fail('moim_policy_invalid'); end if;
    select coalesce(array_agg(distinct left(btrim(w), 40)) filter (where btrim(w) <> ''), '{}') into v_words
      from jsonb_array_elements_text(p->'banned_words') w;
    if array_length(v_words, 1) > 500 then perform public.moim__fail('moim_policy_invalid'); end if;
  end if;
  if p ? 'question_banned_words' then
    if jsonb_typeof(p->'question_banned_words') <> 'array' then perform public.moim__fail('moim_policy_invalid'); end if;
    select coalesce(array_agg(distinct left(btrim(w), 40)) filter (where btrim(w) <> ''), '{}') into v_qwords
      from jsonb_array_elements_text(p->'question_banned_words') w;
    if array_length(v_qwords, 1) > 500 then perform public.moim__fail('moim_policy_invalid'); end if;
  end if;
  if p ? 'prohibited_types' then
    v_types := p->'prohibited_types';
    if jsonb_typeof(v_types) <> 'array' or jsonb_array_length(v_types) > 20 then perform public.moim__fail('moim_policy_invalid'); end if;
    select count(*) into v_bad from jsonb_array_elements(v_types) x
     where jsonb_typeof(x) <> 'object' or coalesce(x->>'code', '') !~ '^[a-z_]{2,40}$'
        or char_length(btrim(coalesce(x->>'label_ko', ''))) not between 1 and 80
        or char_length(btrim(coalesce(x->>'label_en', ''))) not between 1 and 80;
    if v_bad > 0 or (select count(distinct x->>'code') from jsonb_array_elements(v_types) x) <> jsonb_array_length(v_types) then
      perform public.moim__fail('moim_policy_invalid');
    end if;
    select coalesce(jsonb_agg(jsonb_build_object('code', x->>'code', 'label_ko', btrim(x->>'label_ko'), 'label_en', btrim(coalesce(x->>'label_en', '')))), '[]'::jsonb)
      into v_types from jsonb_array_elements(v_types) x;
  end if;
  if p ? 'report_reasons' then
    v_reasons := p->'report_reasons';
    if jsonb_typeof(v_reasons) <> 'array' or jsonb_array_length(v_reasons) > 30 then perform public.moim__fail('moim_policy_invalid'); end if;
    select count(*) into v_bad from jsonb_array_elements(v_reasons) x
     where jsonb_typeof(x) <> 'object' or coalesce(x->>'code', '') !~ '^[a-z_]{2,40}$'
        or char_length(btrim(coalesce(x->>'label_ko', ''))) not between 1 and 80
        or char_length(btrim(coalesce(x->>'label_en', ''))) not between 1 and 80
        or jsonb_typeof(coalesce(x->'is_active', 'true'::jsonb)) <> 'boolean';
    if v_bad > 0 or (select count(distinct x->>'code') from jsonb_array_elements(v_reasons) x) <> jsonb_array_length(v_reasons) then
      perform public.moim__fail('moim_policy_invalid');
    end if;
    -- a reason code that was ever offered is kept (past reports keep their name): deactivate instead of removing
    if exists (select 1 from jsonb_array_elements(coalesce(v_before.report_reasons, '[]'::jsonb)) o
                where not exists (select 1 from jsonb_array_elements(v_reasons) n where n->>'code' = o->>'code')) then
      perform public.moim__fail('moim_policy_report_reason_removed');
    end if;
    select coalesce(jsonb_agg(jsonb_build_object('code', x->>'code', 'label_ko', btrim(x->>'label_ko'), 'label_en', btrim(coalesce(x->>'label_en', '')),
             'is_active', coalesce((x->>'is_active')::boolean, true))), '[]'::jsonb)
      into v_reasons from jsonb_array_elements(v_reasons) x;
    -- D6: at least one report reason stays on (otherwise nobody can report and no direct sanction works)
    if not exists (select 1 from jsonb_array_elements(v_reasons) x where (x->>'is_active')::boolean) then
      perform public.moim__fail('moim_policy_report_reason_none_active');
    end if;
  end if;
  begin
    update public.moim_policies set
      max_moims_per_user = case when p ? 'max_moims_per_user' then (p->>'max_moims_per_user')::int else max_moims_per_user end,
      max_capacity = case when p ? 'max_capacity' then (p->>'max_capacity')::int else max_capacity end,
      max_co_hosts = case when p ? 'max_co_hosts' then (p->>'max_co_hosts')::int else max_co_hosts end,
      max_staff = case when p ? 'max_staff' then (p->>'max_staff')::int else max_staff end,
      max_custom_boards = case when p ? 'max_custom_boards' then (p->>'max_custom_boards')::int else max_custom_boards end,
      max_pinned_notices = case when p ? 'max_pinned_notices' then (p->>'max_pinned_notices')::int else max_pinned_notices end,
      join_request_expire_days = case when p ? 'join_request_expire_days' then (p->>'join_request_expire_days')::int else join_request_expire_days end,
      closed_retention_days = case when p ? 'closed_retention_days' then (p->>'closed_retention_days')::int else closed_retention_days end,
      schedule_room_archive_days = case when p ? 'schedule_room_archive_days' then (p->>'schedule_room_archive_days')::int else schedule_room_archive_days end,
      invite_resend_days = case when p ? 'invite_resend_days' then (p->>'invite_resend_days')::int else invite_resend_days end,
      inactive_unlist_days = case when p ? 'inactive_unlist_days' then (p->>'inactive_unlist_days')::int else inactive_unlist_days end,
      name_min_len = case when p ? 'name_min_len' then (p->>'name_min_len')::int else name_min_len end,
      name_max_len = case when p ? 'name_max_len' then (p->>'name_max_len')::int else name_max_len end,
      intro_min_len = case when p ? 'intro_min_len' then (p->>'intro_min_len')::int else intro_min_len end,
      intro_max_len = case when p ? 'intro_max_len' then (p->>'intro_max_len')::int else intro_max_len end,
      banned_words = case when p ? 'banned_words' then v_words else banned_words end,
      question_banned_words = case when p ? 'question_banned_words' then v_qwords else question_banned_words end,
      prohibited_types = case when p ? 'prohibited_types' then v_types else prohibited_types end,
      report_reasons = case when p ? 'report_reasons' then v_reasons else report_reasons end,
      updated_at = now(), updated_by = p_admin
    where id = 1
    returning * into v_after;
  exception when check_violation or numeric_value_out_of_range or invalid_text_representation then
    perform public.moim__fail('moim_policy_invalid');
  end;
  if (v_after.name_min_len is not null and v_after.name_max_len is not null and v_after.name_min_len > v_after.name_max_len)
     or (v_after.intro_min_len is not null and v_after.intro_max_len is not null and v_after.intro_min_len > v_after.intro_max_len)
     or coalesce(v_after.name_min_len, 1) < 0 or coalesce(v_after.intro_min_len, 0) < 0 then
    perform public.moim__fail('moim_policy_invalid');
  end if;
  perform public.moim__admin_log(null, p_admin, 'admin_policies_updated', null, v_reason, to_jsonb(v_before), to_jsonb(v_after));
  return jsonb_build_object('ok', true, 'updated_at', v_after.updated_at);
end
$function$;

-- moim_report_create
CREATE OR REPLACE FUNCTION public.moim_report_create(p_actor uuid, p_moim uuid, p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_type text := p->>'target_type';
  v_target uuid := nullif(p->>'target_id', '')::uuid;
  v_reason text := btrim(coalesce(p->>'reason_code', ''));
  v_ok boolean;
  v_id uuid;
begin
  if not exists (select 1 from public.moims where id = p_moim and status in ('active', 'closed')) then perform public.moim__fail('moim_not_found'); end if;
  if v_type not in ('moim', 'member', 'post', 'comment', 'schedule', 'album', 'chat_message') or v_target is null then
    perform public.moim__fail('moim_report_target_invalid');
  end if;
  if not public.moim__report_reason_active(v_reason) then perform public.moim__fail('moim_report_reason_invalid'); end if;
  v_ok := case v_type
    when 'moim' then v_target = p_moim
    when 'member' then exists (select 1 from public.moim_members where moim_id = p_moim and user_id = v_target)
    when 'post' then exists (select 1 from public.moim_posts where moim_id = p_moim and id = v_target)
    when 'comment' then exists (select 1 from public.moim_comments where moim_id = p_moim and id = v_target)
    when 'schedule' then exists (select 1 from public.moim_schedules where moim_id = p_moim and id = v_target)
    when 'album' then exists (select 1 from public.moim_album_items where moim_id = p_moim and id = v_target)
    when 'chat_message' then exists (
      select 1 from public.community_messenger_messages msg
        join public.community_messenger_rooms r on r.id = msg.room_id
       where msg.id = v_target and r.owner_domain = 'moim'
         and (r.owner_ref_id = p_moim or r.owner_ref_id in (select id from public.moim_schedules where moim_id = p_moim)))
  end;
  if not coalesce(v_ok, false) then perform public.moim__fail('moim_report_target_invalid'); end if;
  if v_type = 'member' and v_target = p_actor then perform public.moim__fail('moim_cannot_target_self'); end if;
  -- E1: duplicate = same reporter, same moim, same target, still open
  if exists (select 1 from public.moim_reports where reporter_id = p_actor and moim_id = p_moim and target_type = v_type
               and target_id = v_target and status in ('received', 'reviewing')) then
    perform public.moim__fail('moim_report_duplicate');
  end if;
  begin
    insert into public.moim_reports (reporter_id, moim_id, target_type, target_id, reason_code, detail)
    values (p_actor, p_moim, v_type, v_target, v_reason, left(nullif(btrim(coalesce(p->>'detail', '')), ''), 1000))
    returning id into v_id;
  exception when unique_violation then
    perform public.moim__fail('moim_report_duplicate');
  end;
  perform public.moim__log(p_moim, p_actor, 'user', 'report_created', v_id, jsonb_build_object('target_type', v_type));
  return jsonb_build_object('ok', true, 'report_id', v_id);
end
$function$;

-- moim_member_unban
CREATE OR REPLACE FUNCTION public.moim_member_unban(p_actor uuid, p_moim uuid, p_target uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id uuid;
begin
  if not public.moim_actor_can(p_moim, p_actor, 'ban_member') then perform public.moim__fail('moim_forbidden'); end if;
  update public.moim_bans set released_at = now(), released_by = p_actor
   where moim_id = p_moim and user_id = p_target and released_at is null and source = 'moim' returning id into v_id;
  if v_id is null then
    -- E3: a ban placed by a platform admin is lifted only by an admin
    if exists (select 1 from public.moim_bans where moim_id = p_moim and user_id = p_target
                and released_at is null and source = 'admin') then
      perform public.moim__fail('moim_ban_admin_only');
    end if;
    perform public.moim__fail('moim_ban_not_found');
  end if;
  update public.moim_members set status = 'kicked', updated_at = now() where moim_id = p_moim and user_id = p_target and status = 'banned';
  perform public.moim__log(p_moim, p_actor, 'user', 'member_unbanned', p_target, '{}'::jsonb);
  return jsonb_build_object('ok', true);
end
$function$;

-- moim_member_remove
CREATE OR REPLACE FUNCTION public.moim_member_remove(p_actor uuid, p_moim uuid, p_target uuid, p_ban boolean, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor_role text := public.moim_actor_role(p_moim, p_actor);
  v_target record;
  v_found boolean;
begin
  if p_actor = p_target then perform public.moim__fail('moim_cannot_target_self'); end if;
  if not public.moim_actor_can(p_moim, p_actor, case when p_ban then 'ban_member' else 'remove_member' end) then
    perform public.moim__fail('moim_forbidden');
  end if;
  select role, status into v_target from public.moim_members where moim_id = p_moim and user_id = p_target for update;
  v_found := found;
  if not p_ban and (not v_found or v_target.status not in ('active', 'pending')) then
    perform public.moim__fail('moim_target_not_member');
  end if;
  if v_found and v_target.status = 'active' and public.moim__role_rank(v_target.role) >= public.moim__role_rank(v_actor_role) then
    perform public.moim__fail('moim_forbidden');
  end if;
  if v_found and (v_target.status in ('active', 'pending') or p_ban) then
    update public.moim_members
       set status = case when p_ban then 'banned' else 'kicked' end, role = 'member',
           left_at = case when v_target.status = 'active' then now() else left_at end,
           decided_by = p_actor, decided_at = now(), updated_at = now()
     where moim_id = p_moim and user_id = p_target;
    update public.moim_join_requests set status = 'rejected', decided_by = p_actor, decided_at = now()
     where moim_id = p_moim and user_id = p_target and status = 'pending';
    if v_target.status = 'active' then
      perform public.moim__deactivate_member(p_moim, p_target);
    end if;
  end if;
  if p_ban then
    if not exists (select 1 from public.profiles where id = p_target) then perform public.moim__fail('moim_target_not_member'); end if;
    insert into public.moim_bans (moim_id, user_id, banned_by, reason)
    select p_moim, p_target, p_actor, left(p_reason, 500)
     where not exists (select 1 from public.moim_bans where moim_id = p_moim and user_id = p_target and released_at is null);
    -- S-6: no invite to this person stays open in this moim
    update public.moim_invite_targets set status = 'cancelled', responded_at = now()
     where moim_id = p_moim and invitee_user_id = p_target and status = 'sent';
  end if;
  perform public.moim__log(p_moim, p_actor, 'user', case when p_ban then 'member_banned' else 'member_removed' end, p_target,
                           jsonb_build_object('reason', left(p_reason, 500)));
  return jsonb_build_object('ok', true, 'was_active', coalesce(v_found and v_target.status = 'active', false),
    'was_pending', coalesce(v_found and v_target.status = 'pending', false),
    'moim_status', (select status from public.moims where id = p_moim),
    'retention_ended_at', (select retention_ended_at from public.moims where id = p_moim));
end
$function$;

-- moim_post_remove
CREATE OR REPLACE FUNCTION public.moim_post_remove(p_actor uuid, p_post uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_po record;
begin
  select * into v_po from public.moim_posts where id = p_post for update;
  -- an admin-deleted moim keeps everything as is (nobody sees it, it may be restored)
  if not found or v_po.status = 'deleted' or (select status from public.moims where id = v_po.moim_id) = 'deleted' then
    perform public.moim__fail('moim_post_not_found');
  end if;
  -- E8 / D-36: the author deletes an active or hidden post, also after leaving
  if v_po.author_id = p_actor then
    update public.moim_posts set status = 'deleted', is_pinned = false, updated_at = now() where id = p_post;
    perform public.moim__log(v_po.moim_id, p_actor, 'user', 'post_deleted', p_post, jsonb_build_object('from', v_po.status));
    return jsonb_build_object('ok', true, 'result', 'deleted');
  end if;
  if v_po.status <> 'active' then perform public.moim__fail('moim_post_not_found'); end if;
  if not public.moim_actor_can(v_po.moim_id, p_actor, 'hide_post') then perform public.moim__fail('moim_forbidden'); end if;
  update public.moim_posts set status = 'hidden', is_pinned = false, hidden_by = p_actor, hidden_reason = left(p_reason, 500), updated_at = now() where id = p_post;
  perform public.moim__log(v_po.moim_id, p_actor, 'user', 'post_hidden', p_post, jsonb_build_object('reason', left(p_reason, 500)));
  return jsonb_build_object('ok', true, 'result', 'hidden', 'author_id', v_po.author_id);
end
$function$;

-- moim_comment_remove
CREATE OR REPLACE FUNCTION public.moim_comment_remove(p_actor uuid, p_comment uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_c record;
begin
  select * into v_c from public.moim_comments where id = p_comment for update;
  if not found or v_c.status = 'deleted' or (select status from public.moims where id = v_c.moim_id) = 'deleted' then
    perform public.moim__fail('moim_comment_not_found');
  end if;
  -- E8: the author may delete a hidden comment; staff hide only active ones
  if v_c.author_id is distinct from p_actor then
    if v_c.status <> 'active' then perform public.moim__fail('moim_comment_not_found'); end if;
    if not public.moim_actor_can(v_c.moim_id, p_actor, 'hide_post') then perform public.moim__fail('moim_forbidden'); end if;
  end if;
  update public.moim_comments set status = case when v_c.author_id = p_actor then 'deleted' else 'hidden' end, updated_at = now() where id = p_comment;
  if v_c.status = 'active' then   -- a hidden comment was already subtracted when it was hidden
    update public.moim_posts set comment_count = greatest(comment_count - 1, 0) where id = v_c.post_id;
  end if;
  perform public.moim__log(v_c.moim_id, p_actor, 'user', case when v_c.author_id = p_actor then 'comment_deleted' else 'comment_hidden' end, p_comment,
                           jsonb_build_object('from', v_c.status));
  return jsonb_build_object('ok', true);
end
$function$;

-- moim_album_remove
CREATE OR REPLACE FUNCTION public.moim_album_remove(p_actor uuid, p_item uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_i record;
begin
  select * into v_i from public.moim_album_items where id = p_item for update;
  if not found or v_i.status = 'deleted' or (select status from public.moims where id = v_i.moim_id) = 'deleted' then
    perform public.moim__fail('moim_album_not_found');
  end if;
  if v_i.uploader_id = p_actor then
    update public.moim_album_items set status = 'deleted', is_pinned = false where id = p_item;
    perform public.moim__log(v_i.moim_id, p_actor, 'user', 'album_deleted', p_item, jsonb_build_object('from', v_i.status));
    return jsonb_build_object('ok', true, 'result', 'deleted');
  end if;
  if v_i.status <> 'active' then perform public.moim__fail('moim_album_not_found'); end if;
  if not public.moim_actor_can(v_i.moim_id, p_actor, 'hide_post') then perform public.moim__fail('moim_forbidden'); end if;
  update public.moim_album_items set status = 'hidden', is_pinned = false where id = p_item;
  perform public.moim__log(v_i.moim_id, p_actor, 'user', 'album_hidden', p_item, '{}'::jsonb);
  return jsonb_build_object('ok', true, 'result', 'hidden');
end
$function$;

-- moim_comment_create
CREATE OR REPLACE FUNCTION public.moim_comment_create(p_actor uuid, p_post uuid, p_body text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_po record;
  v_body text := btrim(coalesce(p_body, ''));
  v_id uuid;
  v_word text;
  v_pol public.moim_policies;
begin
  select po.*, m.platform_state, m.status as moim_status into v_po from public.moim_posts po join public.moims m on m.id = po.moim_id
   where po.id = p_post;
  if not found or v_po.status <> 'active' or v_po.moim_status = 'deleted' then perform public.moim__fail('moim_post_not_found'); end if;
  if v_po.moim_status <> 'active' then perform public.moim__fail('moim_closed'); end if;
  if v_po.platform_state = 'blocked' then perform public.moim__fail('moim_blocked'); end if;
  if public.moim_actor_role(v_po.moim_id, p_actor) is null then perform public.moim__fail('moim_not_member'); end if;
  if v_body = '' or char_length(v_body) > 2000 then perform public.moim__fail('moim_comment_invalid'); end if;
  select * into v_pol from public.moim_policies where id = 1;
  foreach v_word in array coalesce(v_pol.banned_words, '{}') loop
    if v_word <> '' and position(lower(v_word) in lower(v_body)) > 0 then perform public.moim__fail('moim_banned_word'); end if;
  end loop;
  insert into public.moim_comments (post_id, moim_id, author_id, body) values (p_post, v_po.moim_id, p_actor, v_body) returning id into v_id;
  update public.moim_posts set comment_count = comment_count + 1 where id = p_post;
  update public.moims set last_activity_at = now() where id = v_po.moim_id;
  perform public.moim__log(v_po.moim_id, p_actor, 'user', 'comment_created', v_id, jsonb_build_object('post_id', p_post));
  return jsonb_build_object('ok', true, 'comment_id', v_id,
    'post_author_id', case when exists (select 1 from public.moim_members mm where mm.moim_id = v_po.moim_id and mm.user_id = v_po.author_id and mm.status = 'active')
                           then v_po.author_id end,
    'moim_id', v_po.moim_id);
end
$function$;

-- moim_post_update
CREATE OR REPLACE FUNCTION public.moim_post_update(p_actor uuid, p_post uuid, p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_po record;
  v_title text;
  v_body text;
  v_vis text;
  v_mstatus text;
begin
  select * into v_po from public.moim_posts where id = p_post for update;
  if not found or v_po.status <> 'active' then perform public.moim__fail('moim_post_not_found'); end if;
  select status into v_mstatus from public.moims where id = v_po.moim_id;
  if v_mstatus = 'deleted' then perform public.moim__fail('moim_post_not_found'); end if;
  if v_mstatus <> 'active' then perform public.moim__fail('moim_closed'); end if;
  if v_po.author_id is distinct from p_actor or public.moim_actor_role(v_po.moim_id, p_actor) is null then perform public.moim__fail('moim_forbidden'); end if;
  if (select platform_state from public.moims where id = v_po.moim_id) = 'blocked' then perform public.moim__fail('moim_blocked'); end if;
  if (select kind from public.moim_boards where id = v_po.board_id) = 'notice'
     and not public.moim_actor_can(v_po.moim_id, p_actor, 'pin_notice') then
    perform public.moim__fail('moim_forbidden');
  end if;
  v_title := case when p ? 'title' then btrim(coalesce(p->>'title', '')) else v_po.title end;
  v_body := case when p ? 'body' then btrim(coalesce(p->>'body', '')) else v_po.body end;
  v_vis := case when p ? 'visibility' then p->>'visibility' else v_po.visibility end;
  if v_body = '' then perform public.moim__fail('moim_post_body_required'); end if;
  if char_length(v_title) > 120 or char_length(v_body) > 10000 then perform public.moim__fail('moim_post_too_long'); end if;
  if v_vis not in ('members', 'public') then perform public.moim__fail('moim_visibility_invalid'); end if;
  if p ? 'images' then perform public.moim__assert_images(coalesce(p->'images', '[]'::jsonb)); end if;
  perform public.moim__assert_text_clean(array[v_title, v_body]);
  update public.moim_posts set title = v_title, body = v_body, visibility = v_vis,
    images = case when p ? 'images' then coalesce(p->'images', '[]'::jsonb) else images end, updated_at = now()
  where id = p_post;
  perform public.moim__log(v_po.moim_id, p_actor, 'user', 'post_updated', p_post, '{}'::jsonb);
  return jsonb_build_object('ok', true);
end
$function$;

-- moim_board_upsert
CREATE OR REPLACE FUNCTION public.moim_board_upsert(p_actor uuid, p_moim uuid, p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid := nullif(p->>'board_id', '')::uuid;
  v_name text := btrim(coalesce(p->>'name', ''));
  v_role text := coalesce(nullif(p->>'write_min_role', ''), 'member');
  v_max int;
  v_kind text;
  v_was_active boolean;
  v_reopen boolean := false;
begin
  if not public.moim_actor_can(p_moim, p_actor, 'manage_boards') then perform public.moim__fail('moim_forbidden'); end if;
  if v_role not in ('host', 'co_host', 'staff', 'member') then perform public.moim__fail('moim_role_invalid'); end if;
  if v_id is null then
    if v_name = '' or char_length(v_name) > 30 then perform public.moim__fail('moim_board_name_invalid'); end if;
    perform public.moim__assert_text_clean(array[v_name]);
    select max_custom_boards into v_max from public.moim_policies where id = 1;
    if v_max is not null and (select count(*) from public.moim_boards where moim_id = p_moim and kind = 'custom' and is_active) >= v_max then
      perform public.moim__fail('moim_board_limit');
    end if;
    insert into public.moim_boards (moim_id, kind, name, write_min_role, sort_order)
    values (p_moim, 'custom', v_name, v_role, coalesce((select max(sort_order) from public.moim_boards where moim_id = p_moim), 0) + 1)
    returning id into v_id;
  else
    select kind, is_active into v_kind, v_was_active from public.moim_boards where id = v_id and moim_id = p_moim for update;
    if v_kind is null then perform public.moim__fail('moim_board_not_found'); end if;
    if v_kind <> 'custom' and (p ? 'name' or p ? 'is_active') then perform public.moim__fail('moim_board_system_fixed'); end if;
    if p ? 'name' and (v_name = '' or char_length(v_name) > 30) then perform public.moim__fail('moim_board_name_invalid'); end if;
    if p ? 'name' then perform public.moim__assert_text_clean(array[v_name]); end if;
    -- C15: reopening a closed board counts against the board limit and goes to the end
    if p ? 'is_active' and coalesce((p->>'is_active')::boolean, false) and not coalesce(v_was_active, false) then
      select max_custom_boards into v_max from public.moim_policies where id = 1;
      if v_max is not null and (select count(*) from public.moim_boards where moim_id = p_moim and kind = 'custom' and is_active) >= v_max then
        perform public.moim__fail('moim_board_limit');
      end if;
      v_reopen := true;
    end if;
    update public.moim_boards set
      name = case when p ? 'name' then v_name else name end,
      write_min_role = case when p ? 'write_min_role' and v_kind <> 'notice' then v_role else write_min_role end,
      is_active = case when p ? 'is_active' then (p->>'is_active')::boolean else is_active end,
      sort_order = case when v_reopen then coalesce((select max(b2.sort_order) from public.moim_boards b2 where b2.moim_id = p_moim), 0) + 1
                        else sort_order end
    where id = v_id;
  end if;
  perform public.moim__log(p_moim, p_actor, 'user', 'board_saved', v_id, p);
  return jsonb_build_object('ok', true, 'board_id', v_id);
end
$function$;

-- moim_invite_respond
CREATE OR REPLACE FUNCTION public.moim_invite_respond(p_actor uuid, p_invite_target uuid, p_accept boolean, p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_t record;
  v_inviter_role text;
  v_prof record;
  v_nick text;
  v_res jsonb;
begin
  select * into v_t from public.moim_invite_targets where id = p_invite_target for update;
  if not found or v_t.invitee_user_id <> p_actor or v_t.status <> 'sent' then perform public.moim__fail('moim_invite_not_found'); end if;
  if not p_accept then
    update public.moim_invite_targets set status = 'declined', responded_at = now() where id = p_invite_target;
    perform public.moim__log(v_t.moim_id, p_actor, 'user', 'invite_declined', p_invite_target, '{}'::jsonb);
    return jsonb_build_object('ok', true, 'status', 'declined');
  end if;
  perform public.moim__assert_image_url(nullif(p->>'avatar_url', ''));
  v_inviter_role := public.moim_actor_role(v_t.moim_id, v_t.inviter_id);
  update public.moim_invite_targets set status = 'accepted', responded_at = now() where id = p_invite_target;
  if v_inviter_role is not null and public.moim__role_rank(v_inviter_role) >= public.moim__role_rank('staff') then
    perform public.moim__assert_joinable(v_t.moim_id, p_actor);
    if exists (select 1 from public.moim_members where moim_id = v_t.moim_id and user_id = p_actor and status = 'active') then
      perform public.moim__fail('moim_already_member');
    end if;
    select nickname, avatar_url into v_prof from public.profiles where id = p_actor;
    v_nick := btrim(coalesce(nullif(p->>'nickname', ''), v_prof.nickname, ''));
    if v_nick = '' then perform public.moim__fail('moim_nickname_required'); end if;
    if char_length(v_nick) > 40 then perform public.moim__fail('moim_nickname_invalid'); end if;
    perform public.moim__assert_text_clean(array[v_nick, p->>'bio']);
    with a as (
      update public.moim_join_requests set status = 'approved', decided_by = v_t.inviter_id, decided_at = now()
       where moim_id = v_t.moim_id and user_id = p_actor and status = 'pending'
      returning invite_id
    )
    update public.moim_invites set usage_count = usage_count + 1 where id in (select invite_id from a where invite_id is not null);
    perform public.moim__activate_member(v_t.moim_id, p_actor, v_nick, coalesce(nullif(p->>'avatar_url', ''), v_prof.avatar_url), left(p->>'bio', 300), v_t.inviter_id, v_t.inviter_id);
    perform public.moim__log(v_t.moim_id, p_actor, 'user', 'member_joined', p_actor, jsonb_build_object('via', 'staff_invite'));
    return jsonb_build_object('ok', true, 'status', 'active', 'moim_id', v_t.moim_id);
  end if;
  v_res := public.moim_join(p_actor, v_t.moim_id, p);
  update public.moim_members set invited_by = v_t.inviter_id where moim_id = v_t.moim_id and user_id = p_actor;
  return v_res || jsonb_build_object('moim_id', v_t.moim_id);
end
$function$;

-- moim__activate_member
CREATE OR REPLACE FUNCTION public.moim__activate_member(p_moim uuid, p_user uuid, p_nickname text, p_avatar text, p_bio text, p_invited_by uuid, p_decided_by uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_was_member boolean;
  v_room uuid;
begin
  select joined_at is not null into v_was_member from public.moim_members where moim_id = p_moim and user_id = p_user;
  insert into public.moim_members (moim_id, user_id, role, status, nickname, avatar_url, bio, joined_at, invited_by, decided_by, decided_at)
  values (p_moim, p_user, 'member', 'active', p_nickname, p_avatar, coalesce(p_bio, ''), now(), p_invited_by, p_decided_by, case when p_decided_by is null then null else now() end)
  on conflict (moim_id, user_id) do update
    set role = 'member', status = 'active', nickname = excluded.nickname, avatar_url = excluded.avatar_url, bio = excluded.bio,
        joined_at = now(), left_at = null, invited_by = coalesce(excluded.invited_by, public.moim_members.invited_by), decided_by = excluded.decided_by,
        decided_at = excluded.decided_at,
        rejoin_count = public.moim_members.rejoin_count + case when coalesce(v_was_member, false) then 1 else 0 end,
        updated_at = now();
  select main_room_id into v_room from public.moims where id = p_moim;
  perform public.moim__room_member_activate(v_room, p_user, 'member', p_nickname, p_avatar);
  -- S-6: an active member keeps no open invite in this moim (the invite being accepted is already 'accepted')
  update public.moim_invite_targets set status = 'cancelled', responded_at = now()
   where moim_id = p_moim and invitee_user_id = p_user and status = 'sent';
  perform public.moim__refresh_count(p_moim);
  update public.moims set last_activity_at = now() where id = p_moim;
end
$function$;

-- moim_join
CREATE OR REPLACE FUNCTION public.moim_join(p_actor uuid, p_moim uuid, p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_m record;
  v_cur text;
  v_prof record;
  v_nick text;
  v_req uuid;
  v_answers jsonb;
  v_link_id uuid;
  v_link_by uuid;
begin
  perform public.moim__assert_joinable(p_moim, p_actor);
  perform public.moim__assert_image_url(nullif(p->>'avatar_url', ''));
  select * into v_m from public.moims where id = p_moim;
  select status into v_cur from public.moim_members where moim_id = p_moim and user_id = p_actor;
  if v_cur = 'active' then perform public.moim__fail('moim_already_member'); end if;
  if v_cur = 'pending' then perform public.moim__fail('moim_already_pending'); end if;
  select nickname, avatar_url into v_prof from public.profiles where id = p_actor;
  v_nick := btrim(coalesce(nullif(p->>'nickname', ''), v_prof.nickname, ''));
  if v_nick = '' then perform public.moim__fail('moim_nickname_required'); end if;
  if char_length(v_nick) > 40 then perform public.moim__fail('moim_nickname_invalid'); end if;
  perform public.moim__assert_text_clean(array[v_nick, p->>'bio']);
  if nullif(p->>'invite_token', '') is not null then
    select id, created_by into v_link_id, v_link_by from public.moim_invites
     where token = p->>'invite_token' and moim_id = p_moim and revoked_at is null and (expires_at is null or expires_at > now());
  end if;
  if v_m.join_mode = 'instant' then
    perform public.moim__activate_member(p_moim, p_actor, v_nick, coalesce(nullif(p->>'avatar_url', ''), v_prof.avatar_url), left(p->>'bio', 300), v_link_by, null);
    if v_link_id is not null then update public.moim_invites set usage_count = usage_count + 1 where id = v_link_id; end if;
    perform public.moim__log(p_moim, p_actor, 'user', 'member_joined', p_actor, '{}'::jsonb);
    return jsonb_build_object('ok', true, 'status', 'active', 'room_id', v_m.main_room_id);
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'question', q.question,
           'answer', left(coalesce(case when jsonb_typeof(p->'answers') = 'array' then p->'answers'->>(q.sort_order - 1) end, ''), 1000)
         ) order by q.sort_order), '[]'::jsonb)
    into v_answers
    from public.moim_join_questions q where q.moim_id = p_moim;
  perform public.moim__assert_text_clean(array(select x->>'answer' from jsonb_array_elements(v_answers) x));
  insert into public.moim_members (moim_id, user_id, role, status, nickname, avatar_url, bio, invited_by)
  values (p_moim, p_actor, 'member', 'pending', v_nick, coalesce(nullif(p->>'avatar_url', ''), v_prof.avatar_url), left(coalesce(p->>'bio', ''), 300), v_link_by)
  on conflict (moim_id, user_id) do update
    set status = 'pending', role = 'member', nickname = excluded.nickname, avatar_url = excluded.avatar_url, bio = excluded.bio,
        invited_by = excluded.invited_by, updated_at = now();
  insert into public.moim_join_requests (moim_id, user_id, answers, invite_id)
  values (p_moim, p_actor, v_answers, v_link_id)
  returning id into v_req;
  perform public.moim__log(p_moim, p_actor, 'user', 'join_requested', v_req, '{}'::jsonb);
  return jsonb_build_object('ok', true, 'status', 'pending', 'request_id', v_req, 'nickname', v_nick);
end
$function$;

-- moim_create
CREATE OR REPLACE FUNCTION public.moim_create(p_actor uuid, p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_pol public.moim_policies;
  v_prof record;
  v_lgu text;
  v_cat record;
  v_name text := btrim(coalesce(p->>'name', ''));
  v_intro text := btrim(coalesce(p->>'intro', ''));
  v_join text := coalesce(p->>'join_mode', 'instant');
  v_cap int;
  v_nick text;
  v_id uuid := gen_random_uuid();
  v_room uuid;
  v_q jsonb;
  v_i int := 0;
  v_word text;
  v_topic text;
begin
  perform pg_advisory_xact_lock(hashtextextended('moim_create:' || p_actor::text, 0));
  -- E12 / C17 / E20: input form checks before any cast
  if coalesce(p->>'capacity', '') !~ '^([0-9]{1,6})?$' then perform public.moim__fail('moim_capacity_invalid'); end if;
  if coalesce(p->>'age_min_birth_year', '') !~ '^([0-9]{4})?$' or coalesce(p->>'age_max_birth_year', '') !~ '^([0-9]{4})?$' then
    perform public.moim__fail('moim_age_range_invalid');
  end if;
  perform public.moim__assert_birth_years(nullif(p->>'age_min_birth_year', '')::int, nullif(p->>'age_max_birth_year', '')::int);
  perform public.moim__assert_image_url(nullif(p->>'cover_image_url', ''));
  perform public.moim__assert_image_url(nullif(p->>'avatar_url', ''));
  v_cap := nullif(p->>'capacity', '')::int;
  select * into v_pol from public.moim_policies where id = 1;
  select id, nickname, avatar_url, phone_verified, deleted_at into v_prof from public.profiles where id = p_actor;
  if not found or v_prof.deleted_at is not null then perform public.moim__fail('moim_actor_invalid'); end if;
  if coalesce(v_prof.phone_verified, false) is not true then perform public.moim__fail('moim_phone_verification_required'); end if;
  select a.canonical_lgu_id into v_lgu from public.user_addresses a
   where a.user_id = p_actor and a.is_default_master = true and coalesce(a.is_active, true) = true
   order by a.canonical_lgu_id is null limit 1;
  if not found then perform public.moim__fail('moim_address_required'); end if;
  if v_lgu is null or btrim(v_lgu) = '' then
    v_lgu := nullif(btrim(coalesce(p->>'master_lgu_id', '')), '');
    if v_lgu is null then perform public.moim__fail('moim_address_required'); end if;
    if v_lgu !~ '^[0-9A-Za-z:_-]{2,40}$' then perform public.moim__fail('moim_address_city_unresolved'); end if;
  end if;
  select id, is_active, is_restricted into v_cat from public.moim_categories where id = nullif(p->>'category_id', '')::uuid;
  if not found or not v_cat.is_active or v_cat.is_restricted then perform public.moim__fail('moim_category_invalid'); end if;
  v_topic := public.moim__topic_resolve(v_cat.id, p->>'topic_label');
  if v_join not in ('instant', 'approval') then perform public.moim__fail('moim_join_mode_invalid'); end if;
  if char_length(v_name) < coalesce(v_pol.name_min_len, 1) or char_length(v_name) > coalesce(v_pol.name_max_len, 60) then
    perform public.moim__fail('moim_name_length');
  end if;
  if v_pol.intro_min_len is not null and char_length(v_intro) < v_pol.intro_min_len then perform public.moim__fail('moim_intro_length'); end if;
  if char_length(v_intro) > coalesce(v_pol.intro_max_len, 2000) then perform public.moim__fail('moim_intro_length'); end if;
  if v_cap is not null and (v_cap < 2 or (v_pol.max_capacity is not null and v_cap > v_pol.max_capacity)) then
    perform public.moim__fail('moim_capacity_invalid');
  end if;
  foreach v_word in array coalesce(v_pol.banned_words, '{}') loop
    if v_word <> '' and (position(lower(v_word) in lower(v_name)) > 0 or position(lower(v_word) in lower(v_intro)) > 0) then
      perform public.moim__fail('moim_banned_word');
    end if;
  end loop;
  perform public.moim__assert_questions_clean(p->'questions');
  if v_pol.max_moims_per_user is not null and
     (select count(*) from public.moims where created_by = p_actor and status = 'active') >= v_pol.max_moims_per_user then
    perform public.moim__fail('moim_create_limit');
  end if;
  if exists (select 1 from public.moims where created_by = p_actor and status = 'active' and lgu_id = v_lgu and lower(name) = lower(v_name)) then
    perform public.moim__fail('moim_duplicate');
  end if;
  v_nick := btrim(coalesce(nullif(p->>'nickname', ''), v_prof.nickname, ''));
  if v_nick = '' then perform public.moim__fail('moim_nickname_required'); end if;
  if char_length(v_nick) > 40 then perform public.moim__fail('moim_nickname_invalid'); end if;
  perform public.moim__assert_text_clean(array[v_nick, p->>'bio']);
  begin
    insert into public.moims (id, name, intro, cover_image_url, category_id, topic_label, lgu_id, join_mode, capacity,
                              age_min_birth_year, age_max_birth_year, host_user_id, created_by)
    values (v_id, v_name, v_intro, nullif(p->>'cover_image_url', ''), v_cat.id, v_topic, v_lgu, v_join, v_cap,
            nullif(p->>'age_min_birth_year', '')::int, nullif(p->>'age_max_birth_year', '')::int, p_actor, p_actor);
  exception when unique_violation then
    perform public.moim__fail('moim_duplicate');
  end;
  insert into public.moim_members (moim_id, user_id, role, status, nickname, avatar_url, bio, joined_at)
  values (v_id, p_actor, 'host', 'active', v_nick, coalesce(nullif(p->>'avatar_url', ''), v_prof.avatar_url), left(coalesce(p->>'bio', ''), 300), now());
  insert into public.moim_boards (moim_id, kind, write_min_role, sort_order) values
    (v_id, 'notice', 'staff', 1), (v_id, 'free', 'member', 2), (v_id, 'greeting', 'member', 3), (v_id, 'review', 'member', 4);
  if jsonb_typeof(p->'questions') = 'array' then
    for v_q in select * from jsonb_array_elements(p->'questions') loop
      if btrim(coalesce(v_q #>> '{}', '')) <> '' then
        v_i := v_i + 1;
        if v_i > 3 then perform public.moim__fail('moim_questions_too_many'); end if;
        insert into public.moim_join_questions (moim_id, sort_order, question) values (v_id, v_i, left(btrim(v_q #>> '{}'), 200));
      end if;
    end loop;
  end if;
  v_room := public.moim__room_create('moim', v_id, p_actor, v_name, v_nick, coalesce(nullif(p->>'avatar_url', ''), v_prof.avatar_url));
  update public.moims set main_room_id = v_room, member_count = 1 where id = v_id;
  if nullif(p->>'cover_image_url', '') is not null then
    perform public.moim__writer_on();
    update public.community_messenger_rooms set avatar_url = nullif(p->>'cover_image_url', ''), updated_at = now() where id = v_room;
  end if;
  perform public.moim__log(v_id, p_actor, 'user', 'created', null, jsonb_build_object('join_mode', v_join));
  return jsonb_build_object('ok', true, 'moim_id', v_id, 'room_id', v_room);
end
$function$;

-- moim_update_info
CREATE OR REPLACE FUNCTION public.moim_update_info(p_actor uuid, p_moim uuid, p jsonb, p_expected_updated_at timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_pol public.moim_policies;
  v_m record;
  v_name text;
  v_intro text;
  v_cap int;
  v_cat uuid;
  v_room uuid;
  v_q jsonb;
  v_i int := 0;
  v_word text;
  v_topic text;
  v_min int;
  v_max int;
begin
  if not public.moim_actor_can(p_moim, p_actor, 'edit_info') then perform public.moim__fail('moim_forbidden'); end if;
  select * into v_m from public.moims where id = p_moim for update;
  if p_expected_updated_at is null or v_m.updated_at <> p_expected_updated_at then perform public.moim__fail('moim_conflict'); end if;
  select * into v_pol from public.moim_policies where id = 1;
  -- E20 / C17 / E12: input form checks before any cast
  if p ? 'capacity' and coalesce(p->>'capacity', '') !~ '^([0-9]{1,6})?$' then perform public.moim__fail('moim_capacity_invalid'); end if;
  if p ? 'category_id' and coalesce(p->>'category_id', '') !~* '^([0-9a-f-]{36})?$' then perform public.moim__fail('moim_category_invalid'); end if;
  if (p ? 'age_min_birth_year' and coalesce(p->>'age_min_birth_year', '') !~ '^([0-9]{4})?$')
     or (p ? 'age_max_birth_year' and coalesce(p->>'age_max_birth_year', '') !~ '^([0-9]{4})?$') then
    perform public.moim__fail('moim_age_range_invalid');
  end if;
  v_min := case when p ? 'age_min_birth_year' then nullif(p->>'age_min_birth_year', '')::int else v_m.age_min_birth_year end;
  v_max := case when p ? 'age_max_birth_year' then nullif(p->>'age_max_birth_year', '')::int else v_m.age_max_birth_year end;
  -- C17: check birth years only when this save changes them (an older stored value must not block other edits)
  if (p ? 'age_min_birth_year' and v_min is distinct from v_m.age_min_birth_year)
     or (p ? 'age_max_birth_year' and v_max is distinct from v_m.age_max_birth_year) then
    perform public.moim__assert_birth_years(v_min, v_max);
  end if;
  if p ? 'cover_image_url' and nullif(p->>'cover_image_url', '') is distinct from v_m.cover_image_url then
    perform public.moim__assert_image_url(nullif(p->>'cover_image_url', ''));
  end if;
  v_name := case when p ? 'name' then btrim(coalesce(p->>'name', '')) else v_m.name end;
  v_intro := case when p ? 'intro' then btrim(coalesce(p->>'intro', '')) else v_m.intro end;
  v_cap := case when p ? 'capacity' then nullif(p->>'capacity', '')::int else v_m.capacity end;
  v_cat := case when p ? 'category_id' then nullif(p->>'category_id', '')::uuid else v_m.category_id end;
  if char_length(v_name) < coalesce(v_pol.name_min_len, 1) or char_length(v_name) > coalesce(v_pol.name_max_len, 60) then perform public.moim__fail('moim_name_length'); end if;
  if char_length(v_intro) > coalesce(v_pol.intro_max_len, 2000) or (v_pol.intro_min_len is not null and char_length(v_intro) < v_pol.intro_min_len) then
    perform public.moim__fail('moim_intro_length');
  end if;
  if v_cap is not null and (v_cap < 2 or v_cap < v_m.member_count or (v_pol.max_capacity is not null and v_cap > v_pol.max_capacity)) then
    perform public.moim__fail('moim_capacity_invalid');
  end if;
  if v_cat is distinct from v_m.category_id then
    if not exists (select 1 from public.moim_categories where id = v_cat and is_active and not is_restricted) then perform public.moim__fail('moim_category_invalid'); end if;
  elsif not exists (select 1 from public.moim_categories where id = v_cat) then
    perform public.moim__fail('moim_category_invalid');
  end if;
  if p ? 'join_mode' and coalesce(p->>'join_mode', '') not in ('instant', 'approval') then perform public.moim__fail('moim_join_mode_invalid'); end if;
  v_topic := public.moim__topic_resolve(v_cat, case when p ? 'topic_label' then p->>'topic_label' else v_m.topic_label end);
  foreach v_word in array coalesce(v_pol.banned_words, '{}') loop
    if v_word <> '' and (position(lower(v_word) in lower(v_name)) > 0 or position(lower(v_word) in lower(v_intro)) > 0) then
      perform public.moim__fail('moim_banned_word');
    end if;
  end loop;
  perform public.moim__assert_questions_clean(p->'questions');
  begin
    update public.moims set
      name = v_name, intro = v_intro, capacity = v_cap, category_id = v_cat, topic_label = v_topic,
      cover_image_url = case when p ? 'cover_image_url' then nullif(p->>'cover_image_url', '') else cover_image_url end,
      join_mode = case when p->>'join_mode' in ('instant', 'approval') then p->>'join_mode' else join_mode end,
      age_min_birth_year = v_min,
      age_max_birth_year = v_max,
      updated_at = now()
    where id = p_moim;
  exception when unique_violation then
    perform public.moim__fail('moim_duplicate');
  end;
  if jsonb_typeof(p->'questions') = 'array' then
    delete from public.moim_join_questions where moim_id = p_moim;
    for v_q in select * from jsonb_array_elements(p->'questions') loop
      if btrim(coalesce(v_q #>> '{}', '')) <> '' then
        v_i := v_i + 1;
        if v_i > 3 then perform public.moim__fail('moim_questions_too_many'); end if;
        insert into public.moim_join_questions (moim_id, sort_order, question) values (p_moim, v_i, left(btrim(v_q #>> '{}'), 200));
      end if;
    end loop;
  end if;
  if v_name <> v_m.name or (p ? 'cover_image_url') then
    perform public.moim__writer_on();
    select main_room_id into v_room from public.moims where id = p_moim;
    if v_room is not null then
      update public.community_messenger_rooms
         set title = left(v_name, 120),
             avatar_url = (select cover_image_url from public.moims where id = p_moim),
             updated_at = now()
       where id = v_room;
    end if;
  end if;
  perform public.moim__log(p_moim, p_actor, 'user', 'info_updated', null, p);
  return jsonb_build_object('ok', true, 'updated_at', (select updated_at from public.moims where id = p_moim));
end
$function$;

-- moim_profile_update
CREATE OR REPLACE FUNCTION public.moim_profile_update(p_actor uuid, p_moim uuid, p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_mem record;
  v_nick text;
  v_room uuid;
  v_m record;
begin
  -- E18: ended moim -> moim_closed, missing or deleted -> moim_not_found, blocked -> moim_blocked
  select status, platform_state into v_m from public.moims where id = p_moim;
  if not found or v_m.status = 'deleted' then perform public.moim__fail('moim_not_found'); end if;
  if v_m.status <> 'active' then perform public.moim__fail('moim_closed'); end if;
  if v_m.platform_state = 'blocked' then perform public.moim__fail('moim_blocked'); end if;
  select * into v_mem from public.moim_members where moim_id = p_moim and user_id = p_actor and status = 'active' for update;
  if not found then perform public.moim__fail('moim_not_member'); end if;
  -- E12: only a changed photo is checked (a copied DIBAY default avatar or an older value must not block a nickname edit)
  if p ? 'avatar_url' and nullif(p->>'avatar_url', '') is distinct from v_mem.avatar_url then
    perform public.moim__assert_image_url(nullif(p->>'avatar_url', ''));
  end if;
  v_nick := case when p ? 'nickname' then btrim(coalesce(p->>'nickname', '')) else v_mem.nickname end;
  if v_nick = '' or char_length(v_nick) > 40 then perform public.moim__fail('moim_nickname_invalid'); end if;
  perform public.moim__assert_text_clean(array[v_nick, case when p ? 'bio' then p->>'bio' end]);
  insert into public.moim_member_profile_history (moim_id, user_id, nickname, avatar_url, bio)
  values (p_moim, p_actor, v_mem.nickname, v_mem.avatar_url, v_mem.bio);
  update public.moim_members set
    nickname = v_nick,
    avatar_url = case when p ? 'avatar_url' then nullif(p->>'avatar_url', '') else avatar_url end,
    bio = case when p ? 'bio' then left(coalesce(p->>'bio', ''), 300) else bio end,
    updated_at = now()
  where moim_id = p_moim and user_id = p_actor;
  perform public.moim__writer_on();
  for v_room in select public.moim__rooms_of(p_moim) loop
    update public.community_messenger_room_profiles
       set display_name = left(v_nick, 40),
           avatar_url = (select avatar_url from public.moim_members where moim_id = p_moim and user_id = p_actor),
           bio = (select left(coalesce(bio, ''), 300) from public.moim_members where moim_id = p_moim and user_id = p_actor),
           updated_at = now()
     where room_id = v_room and user_id = p_actor;
  end loop;
  perform public.moim__log(p_moim, p_actor, 'user', 'profile_updated', p_actor, '{}'::jsonb);
  return jsonb_build_object('ok', true);
end
$function$;

-- moim__room_member_activate
CREATE OR REPLACE FUNCTION public.moim__room_member_activate(p_room uuid, p_user uuid, p_role text, p_nickname text, p_avatar text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cm_role text := public.moim__cm_role(p_role);
begin
  if p_room is null then return; end if;
  perform public.moim__writer_on();
  insert into public.community_messenger_participants (room_id, user_id, role, left_at, joined_at)
  values (p_room, p_user, v_cm_role, null, now())
  on conflict (room_id, user_id) do update
    set role = excluded.role, left_at = null, joined_at = case when public.community_messenger_participants.left_at is null then public.community_messenger_participants.joined_at else now() end;
  insert into public.community_messenger_room_profiles (room_id, user_id, identity_mode, display_name, bio, avatar_url)
  values (p_room, p_user, 'alias', left(p_nickname, 40),
          coalesce((select left(mm.bio, 300) from public.moim_members mm
                     where mm.moim_id = public.moim__room_moim_id(p_room) and mm.user_id = p_user), ''),
          p_avatar)
  on conflict (room_id, user_id) do update
    set identity_mode = 'alias', display_name = excluded.display_name, avatar_url = excluded.avatar_url, bio = excluded.bio,
        updated_at = now();
end
$function$;

-- moim_member_note_set
CREATE OR REPLACE FUNCTION public.moim_member_note_set(p_actor uuid, p_moim uuid, p_target uuid, p_body text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid;
  v_target_role text;
begin
  if not public.moim_actor_can(p_moim, p_actor, 'write_note') then perform public.moim__fail('moim_forbidden'); end if;
  if p_actor = p_target then perform public.moim__fail('moim_cannot_target_self'); end if;
  select role into v_target_role from public.moim_members where moim_id = p_moim and user_id = p_target;
  if not found then perform public.moim__fail('moim_target_not_member'); end if;
  -- C13: notes only on lower roles (a left member or an applicant row has role member)
  if public.moim__role_rank(v_target_role) >= public.moim__role_rank(public.moim_actor_role(p_moim, p_actor)) then
    perform public.moim__fail('moim_forbidden');
  end if;
  if btrim(coalesce(p_body, '')) = '' then
    delete from public.moim_member_notes where moim_id = p_moim and target_user_id = p_target;
    perform public.moim__log(p_moim, p_actor, 'user', 'note_deleted', p_target, '{}'::jsonb);
    return jsonb_build_object('ok', true, 'deleted', true);
  end if;
  select id into v_id from public.moim_member_notes where moim_id = p_moim and target_user_id = p_target order by created_at limit 1;
  if v_id is null then
    insert into public.moim_member_notes (moim_id, target_user_id, author_user_id, body) values (p_moim, p_target, p_actor, left(btrim(p_body), 1000)) returning id into v_id;
  else
    update public.moim_member_notes set body = left(btrim(p_body), 1000), author_user_id = p_actor, updated_at = now() where id = v_id;
  end if;
  perform public.moim__log(p_moim, p_actor, 'user', 'note_set', p_target, '{}'::jsonb);
  return jsonb_build_object('ok', true, 'note_id', v_id);
end
$function$;

-- moim_member_role_set
CREATE OR REPLACE FUNCTION public.moim_member_role_set(p_actor uuid, p_moim uuid, p_target uuid, p_role text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_pol public.moim_policies;
  v_cur text;
  v_room uuid;
begin
  if p_role not in ('co_host', 'staff', 'member') then perform public.moim__fail('moim_role_invalid'); end if;
  if not public.moim_actor_can(p_moim, p_actor, 'set_role') then perform public.moim__fail('moim_forbidden'); end if;
  if p_actor = p_target then perform public.moim__fail('moim_cannot_target_self'); end if;
  select role into v_cur from public.moim_members where moim_id = p_moim and user_id = p_target and status = 'active' for update;
  if v_cur is null then perform public.moim__fail('moim_target_not_member'); end if;
  if v_cur = 'host' then perform public.moim__fail('moim_forbidden'); end if;
  if v_cur = p_role then return jsonb_build_object('ok', true, 'changed', false); end if;   -- E9: no log, no notice
  select * into v_pol from public.moim_policies where id = 1;
  if p_role = 'co_host' and v_pol.max_co_hosts is not null and v_cur <> 'co_host' and
     (select count(*) from public.moim_members where moim_id = p_moim and status = 'active' and role = 'co_host') >= v_pol.max_co_hosts then
    perform public.moim__fail('moim_role_limit');
  end if;
  if p_role = 'staff' and v_pol.max_staff is not null and v_cur <> 'staff' and
     (select count(*) from public.moim_members where moim_id = p_moim and status = 'active' and role = 'staff') >= v_pol.max_staff then
    perform public.moim__fail('moim_role_limit');
  end if;
  update public.moim_members set role = p_role, role_changed_at = now(), updated_at = now() where moim_id = p_moim and user_id = p_target;
  perform public.moim__sync_member_rooms(p_moim, p_target);
  perform public.moim__log(p_moim, p_actor, 'user', 'role_changed', p_target, jsonb_build_object('from', v_cur, 'to', p_role));
  return jsonb_build_object('ok', true, 'changed', true);
end
$function$;

-- moim_host_transfer_request
CREATE OR REPLACE FUNCTION public.moim_host_transfer_request(p_actor uuid, p_moim uuid, p_to uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id uuid;
begin
  if not public.moim_actor_can(p_moim, p_actor, 'transfer_host') then perform public.moim__fail('moim_forbidden'); end if;
  if p_actor = p_to then perform public.moim__fail('moim_cannot_target_self'); end if;
  if not exists (select 1 from public.moim_members where moim_id = p_moim and user_id = p_to and status = 'active') then
    perform public.moim__fail('moim_target_not_member');
  end if;
  perform public.moim__assert_host_swap_cap(p_moim, p_to);
  -- C5: an open request (any kind) is never cancelled silently; the sender cancels it with moim_host_transfer_cancel
  if exists (select 1 from public.moim_host_transfers where moim_id = p_moim and status = 'requested') then
    perform public.moim__fail('moim_transfer_pending');
  end if;
  begin
    insert into public.moim_host_transfers (moim_id, from_user_id, to_user_id, kind, status, actor_id)
    values (p_moim, p_actor, p_to, 'direct', 'requested', p_actor) returning id into v_id;
  exception when unique_violation then
    perform public.moim__fail('moim_transfer_pending');
  end;
  perform public.moim__log(p_moim, p_actor, 'user', 'host_transfer_requested', p_to, '{}'::jsonb);
  return jsonb_build_object('ok', true, 'transfer_id', v_id);
end
$function$;

-- moim_host_inactive_request
CREATE OR REPLACE FUNCTION public.moim_host_inactive_request(p_actor uuid, p_moim uuid, p_to uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_m record;
  v_last timestamptz;
  v_id uuid;
begin
  select * into v_m from public.moims where id = p_moim for update;
  if not found or v_m.status <> 'active' then perform public.moim__fail('moim_not_found'); end if;
  if v_m.platform_state = 'blocked' then perform public.moim__fail('moim_blocked'); end if;   -- E18: warned stays allowed
  if public.moim_actor_role(p_moim, p_actor) not in ('co_host', 'staff') or public.moim_actor_role(p_moim, p_actor) is null then
    perform public.moim__fail('moim_forbidden');
  end if;
  if p_to = v_m.host_user_id or not exists (select 1 from public.moim_members where moim_id = p_moim and user_id = p_to and status = 'active') then
    perform public.moim__fail('moim_target_not_member');
  end if;
  select last_login_at into v_last from public.profiles where id = v_m.host_user_id;
  if v_last is not null and v_last > now() - interval '30 days' then perform public.moim__fail('moim_host_recently_active'); end if;
  if exists (select 1 from public.moim_host_transfers where moim_id = p_moim and status = 'requested') then
    perform public.moim__fail('moim_transfer_pending');
  end if;
  insert into public.moim_host_transfers (moim_id, from_user_id, to_user_id, kind, status, reason, actor_id)
  values (p_moim, v_m.host_user_id, p_to, 'inactive_request', 'requested', left(nullif(btrim(coalesce(p_reason, '')), ''), 500), p_actor)
  returning id into v_id;
  perform public.moim__log(p_moim, p_actor, 'user', 'host_inactive_requested', p_to, jsonb_build_object('host_last_login_at', v_last));
  return jsonb_build_object('ok', true, 'transfer_id', v_id);
end
$function$;

-- moim__release_member
CREATE OR REPLACE FUNCTION public.moim__release_member(p_moim uuid, p_user uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_host uuid;
  v_s record;
  v_mem record;
begin
  update public.moim_host_transfers set status = 'cancelled', decided_at = now()
   where moim_id = p_moim and status = 'requested' and (to_user_id = p_user or from_user_id = p_user);
  update public.moim_invite_targets set status = 'cancelled', responded_at = now()
   where moim_id = p_moim and inviter_id = p_user and status = 'sent';
  select host_user_id into v_host from public.moims where id = p_moim;
  if v_host is null or v_host = p_user then return; end if;
  select nickname, avatar_url into v_mem from public.moim_members where moim_id = p_moim and user_id = v_host;
  for v_s in
    select * from public.moim_schedules
     where moim_id = p_moim and host_user_id = p_user and status in ('recruiting', 'full', 'closed')   -- E14: started but unfinished too
     for update
  loop
    update public.moim_schedules set host_user_id = v_host, updated_at = now() where id = v_s.id;
    insert into public.moim_schedule_participants (schedule_id, user_id, status)
    values (v_s.id, v_host, 'confirmed')
    on conflict (schedule_id, user_id) do update set status = 'confirmed', updated_at = now();
    if v_s.room_id is not null then
      perform public.moim__room_member_role(v_s.room_id, p_user, 'member');
      perform public.moim__room_member_activate(v_s.room_id, v_host, 'host', coalesce(v_mem.nickname, ''), v_mem.avatar_url);
      perform public.moim__room_member_role(v_s.room_id, v_host, 'host');
    end if;
    perform public.moim__schedule_refresh(v_s.id);
    perform public.moim__log(p_moim, null, 'system', 'schedule_host_reassigned', v_s.id, jsonb_build_object('from', p_user, 'to', v_host));
  end loop;
end
$function$;

-- moim_schedule_leave
CREATE OR REPLACE FUNCTION public.moim_schedule_leave(p_actor uuid, p_schedule uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_s record;
  v_cur text;
begin
  -- E18: leaving is a retreat action, so a blocked moim does not stop it (ended or deleted moims still do)
  select s.*, m.status as moim_status into v_s
    from public.moim_schedules s join public.moims m on m.id = s.moim_id
   where s.id = p_schedule for update of s;
  if not found or v_s.moim_status <> 'active' then perform public.moim__fail('moim_schedule_not_found'); end if;
  if v_s.status in ('done', 'cancelled') then perform public.moim__fail('moim_schedule_finished'); end if;
  if v_s.starts_at <= now() then perform public.moim__fail('moim_schedule_started'); end if;
  if v_s.host_user_id = p_actor then perform public.moim__fail('moim_schedule_host_cannot_leave'); end if;
  select status into v_cur from public.moim_schedule_participants where schedule_id = p_schedule and user_id = p_actor for update;
  if v_cur is null or v_cur not in ('confirmed', 'requested') then perform public.moim__fail('moim_schedule_not_joined'); end if;
  update public.moim_schedule_participants set status = 'cancelled', updated_at = now() where schedule_id = p_schedule and user_id = p_actor;
  if v_cur = 'confirmed' then perform public.moim__room_member_deactivate(v_s.room_id, p_actor); end if;
  perform public.moim__schedule_refresh(p_schedule);
  perform public.moim__log(v_s.moim_id, p_actor, 'user', 'schedule_left', p_schedule, '{}'::jsonb);
  return jsonb_build_object('ok', true);
end
$function$;

-- moim_schedule_decide
CREATE OR REPLACE FUNCTION public.moim_schedule_decide(p_actor uuid, p_schedule uuid, p_user uuid, p_approve boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_s record;
  v_cur text;
begin
  v_s := public.moim__schedule_open_for_change(p_schedule);
  if not public.moim__schedule_can_manage(p_schedule, p_actor) then perform public.moim__fail('moim_forbidden'); end if;
  select status into v_cur from public.moim_schedule_participants where schedule_id = p_schedule and user_id = p_user for update;
  if v_cur is distinct from 'requested' then perform public.moim__fail('moim_schedule_request_not_found'); end if;
  if p_approve then
    if public.moim_actor_role(v_s.moim_id, p_user) is null then perform public.moim__fail('moim_target_not_member'); end if;
    if v_s.capacity is not null and v_s.confirmed_count >= v_s.capacity then perform public.moim__fail('moim_full'); end if;
    perform public.moim__schedule_confirm(p_schedule, p_user, p_actor);
  else
    update public.moim_schedule_participants set status = 'rejected', decided_by = p_actor, decided_at = now(), updated_at = now()
     where schedule_id = p_schedule and user_id = p_user;
  end if;
  perform public.moim__log(v_s.moim_id, p_actor, 'user', case when p_approve then 'schedule_approved' else 'schedule_rejected' end, p_user,
                           jsonb_build_object('schedule_id', p_schedule));
  return jsonb_build_object('ok', true, 'moim_id', v_s.moim_id, 'title', v_s.title, 'approved', p_approve);
end
$function$;

-- moim_account_cleanup
CREATE OR REPLACE FUNCTION public.moim_account_cleanup(p_user uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_m record;
  v_next uuid;
  v_room uuid;
  v_mm record;
  v_transferred int := 0;
  v_closed int := 0;
  v_left int := 0;
  v_handovers jsonb := '[]'::jsonb;
begin
  if p_user is null then perform public.moim__fail('moim_actor_invalid'); end if;
  for v_m in select * from public.moims
              where host_user_id = p_user and (status = 'active' or (status = 'deleted' and closed_at is null))
              order by created_at for update loop
    select mm.user_id into v_next
      from public.moim_members mm
     where mm.moim_id = v_m.id and mm.status = 'active' and mm.user_id <> p_user
     order by case mm.role when 'co_host' then 1 when 'staff' then 2 else 3 end,
              case when mm.role in ('co_host', 'staff') then mm.role_changed_at end asc nulls last,
              mm.joined_at asc nulls last, mm.created_at asc
     limit 1;
    update public.moim_host_transfers set status = 'cancelled', decided_at = now() where moim_id = v_m.id and status = 'requested';
    if v_next is not null then
      perform public.moim__host_swap(v_m.id, p_user, v_next);
      insert into public.moim_host_transfers (moim_id, from_user_id, to_user_id, kind, status, actor_id, decided_at)
      values (v_m.id, p_user, v_next, 'account_withdrawal', 'done', null, now());
      perform public.moim__log(v_m.id, null, 'system', 'host_changed', v_next, jsonb_build_object('from', p_user, 'kind', 'account_withdrawal'));
      v_transferred := v_transferred + 1;
      v_handovers := v_handovers || jsonb_build_array(jsonb_build_object('moim_id', v_m.id, 'to_user_id', v_next,
        'moim_status', v_m.status,
        'to_nickname', (select nickname from public.moim_members where moim_id = v_m.id and user_id = v_next)));
    elsif v_m.status = 'deleted' then
      update public.moims set closed_at = now(), updated_at = now() where id = v_m.id;
      perform public.moim__log(v_m.id, null, 'system', 'closed', null, jsonb_build_object('reason', 'account_withdrawal', 'host', p_user, 'deleted', true));
      v_closed := v_closed + 1;
    else
      update public.moims set status = 'closed', closed_at = now(), updated_at = now() where id = v_m.id;
      perform public.moim__close_cleanup(v_m.id);
      perform public.moim__writer_on();
      for v_room in select public.moim__rooms_of(v_m.id) loop
        update public.community_messenger_rooms set is_readonly = true, updated_at = now() where id = v_room;
      end loop;
      perform public.moim__log(v_m.id, null, 'system', 'closed', null, jsonb_build_object('reason', 'account_withdrawal', 'host', p_user));
      v_closed := v_closed + 1;
    end if;
  end loop;
  for v_mm in select moim_id, status from public.moim_members where user_id = p_user and status in ('active', 'pending') loop
    if v_mm.status = 'active' then
      update public.moim_members set status = 'left', role = 'member', left_at = now(), updated_at = now()
       where moim_id = v_mm.moim_id and user_id = p_user;
      perform public.moim__deactivate_member(v_mm.moim_id, p_user);
      perform public.moim__log(v_mm.moim_id, null, 'system', 'member_left', p_user, jsonb_build_object('reason', 'account_withdrawal'));
      v_left := v_left + 1;
    else
      update public.moim_members set status = 'cancelled', updated_at = now() where moim_id = v_mm.moim_id and user_id = p_user;
    end if;
  end loop;
  update public.moim_join_requests set status = 'cancelled', decided_at = now() where user_id = p_user and status = 'pending';
  update public.moim_invite_targets set status = 'declined', responded_at = now() where invitee_user_id = p_user and status = 'sent';
  update public.moim_invite_targets set status = 'cancelled', responded_at = now() where inviter_id = p_user and status = 'sent';
  -- A-08: open host transfer requests naming this user in any moim
  update public.moim_host_transfers set status = 'cancelled', decided_at = now()
   where status = 'requested' and (to_user_id = p_user or from_user_id = p_user);
  -- A-05 (bundle2 B8): a closed or deleted moim keeps no pointer to a withdrawn host
  update public.moims set host_user_id = null, updated_at = now()
   where host_user_id = p_user and status in ('closed', 'deleted');
  return jsonb_build_object('ok', true, 'transferred', v_transferred, 'closed', v_closed, 'left', v_left, 'handovers', v_handovers);
end
$function$;

-- cm_moim_guard_rooms
CREATE OR REPLACE FUNCTION public.cm_moim_guard_rooms()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_writer boolean := coalesce(current_setting('dibay.moim_writer', true), '') = 'on';
begin
  if tg_op = 'UPDATE' and (new.owner_domain is distinct from old.owner_domain or new.owner_ref_id is distinct from old.owner_ref_id) then
    raise exception 'moim_room_owner_immutable' using errcode = 'P0001';
  end if;
  if tg_op = 'INSERT' then
    if new.owner_domain is not null and not v_writer then
      raise exception 'moim_room_create_requires_moim' using errcode = 'P0001';
    end if;
    return new;
  end if;
  if old.owner_domain is null or v_writer then
    return new;
  end if;
  if new.owner_user_id is distinct from old.owner_user_id
     or new.deleted_at is distinct from old.deleted_at
     or new.room_type is distinct from old.room_type
     or new.visibility is distinct from old.visibility
     or new.join_policy is distinct from old.join_policy
     or new.is_discoverable is distinct from old.is_discoverable
     or new.invite_link_enabled is distinct from old.invite_link_enabled
     or new.invite_token is distinct from old.invite_token
     or new.allow_member_invite is distinct from old.allow_member_invite
     or new.allow_admin_invite is distinct from old.allow_admin_invite
     or new.allow_admin_kick is distinct from old.allow_admin_kick
     or new.title is distinct from old.title
     or new.avatar_url is distinct from old.avatar_url
     or new.member_limit is distinct from old.member_limit
     or new.identity_policy is distinct from old.identity_policy
     or new.notice_text is distinct from old.notice_text
     or new.notice_updated_at is distinct from old.notice_updated_at
     or new.notice_updated_by is distinct from old.notice_updated_by
     or new.allow_admin_edit_notice is distinct from old.allow_admin_edit_notice
     or new.is_readonly is distinct from old.is_readonly
     or new.room_status is distinct from old.room_status then
    raise exception 'moim_room_settings_managed_by_moim' using errcode = 'P0001';
  end if;
  return new;
end
$function$;

-- ===== 4. data repairs (backup first, idempotent: a second run changes 0 rows)
-- R-4 (E3): open bans placed by a platform admin -> source admin
insert into public.moim_r5_backup_20271128 (tbl, row_id, row_data)
select 'moim_bans', b.id, to_jsonb(b) from public.moim_bans b
 where b.released_at is null and b.source = 'moim'
   and exists (select 1 from public.moim_events e where e.moim_id = b.moim_id and e.target_id = b.user_id
                and e.type = 'admin_member_banned' and e.actor_kind = 'admin' and e.actor_id = b.banned_by)
on conflict do nothing;
update public.moim_bans b set source = 'admin'
 where b.released_at is null and b.source = 'moim'
   and exists (select 1 from public.moim_events e where e.moim_id = b.moim_id and e.target_id = b.user_id
                and e.type = 'admin_member_banned' and e.actor_kind = 'admin' and e.actor_id = b.banned_by);

-- R-1 (E1): reports closed by another moim's decision go back to received
-- (rows that would clash with the new per-moim open index are left as is and only listed in the apply report)
drop table if exists pg_temp.moim_r5_revive;
create temp table moim_r5_revive as
with wrong as (
  select r.id from public.moim_events e
   cross join lateral jsonb_array_elements_text(coalesce(e.payload->'after'->'closed_report_ids', '[]'::jsonb)) x(id)
   join public.moim_reports r on r.id = x.id::uuid
  where e.type in ('admin_report_actioned', 'admin_report_dismissed') and r.moim_id <> e.moim_id
    and r.status in ('actioned', 'dismissed') and r.handled_at = e.created_at and r.handled_by = e.actor_id
  union
  select r2.id from public.moim_reports r1
    join public.moim_reports r2 on r2.target_type = r1.target_type and r2.target_id = r1.target_id and r2.moim_id <> r1.moim_id
     and r2.handled_by = r1.handled_by and r2.handled_at = r1.handled_at
   where r1.status in ('actioned', 'dismissed') and r2.status in ('actioned', 'dismissed')
     and exists (select 1 from public.moim_events e where e.moim_id = r1.moim_id and e.target_id = r1.id
                  and e.type in ('admin_report_actioned', 'admin_report_dismissed') and e.created_at = r1.handled_at)
)
select distinct on (r.reporter_id, r.moim_id, r.target_type, r.target_id) r.id
  from public.moim_reports r
 where r.id in (select id from wrong)
   and not exists (select 1 from public.moim_reports o where o.reporter_id = r.reporter_id and o.moim_id = r.moim_id
                    and o.target_type = r.target_type and o.target_id = r.target_id and o.status in ('received', 'reviewing'))
 order by r.reporter_id, r.moim_id, r.target_type, r.target_id, r.created_at desc;
insert into public.moim_r5_backup_20271128 (tbl, row_id, row_data)
select 'moim_reports', r.id, to_jsonb(r) from public.moim_reports r where r.id in (select id from moim_r5_revive)
on conflict do nothing;
update public.moim_reports set status = 'received', action_id = null, handled_by = null, handled_at = null
 where id in (select id from moim_r5_revive);

-- R-2 (D3): duplicate active moim-level sanctions -> keep the one that ends last (null = never), revoke the rest
drop table if exists pg_temp.moim_r5_dedup;
create temp table moim_r5_dedup as
select id, moim_id, level, keep_id from (
  select s.id, s.moim_id, s.level,
         row_number() over (partition by s.moim_id, s.level order by s.ends_at desc nulls first, s.created_at desc, s.id) as rn,
         first_value(s.id) over (partition by s.moim_id, s.level order by s.ends_at desc nulls first, s.created_at desc, s.id) as keep_id
    from public.moim_sanctions s
   where s.target_kind = 'moim' and s.level in ('unlist', 'warn', 'block') and s.revoked_at is null
     and s.starts_at <= now() and (s.ends_at is null or s.ends_at > now())) z
 where rn > 1;
insert into public.moim_r5_backup_20271128 (tbl, row_id, row_data)
select 'moim_sanctions', s.id, to_jsonb(s) from public.moim_sanctions s where s.id in (select id from moim_r5_dedup)
on conflict do nothing;
insert into public.moim_r5_backup_20271128 (tbl, row_id, row_data)
select 'moim_reports', r.id, to_jsonb(r) from public.moim_reports r where r.action_id in (select id from moim_r5_dedup)
on conflict do nothing;
-- reports that point at a revoked duplicate now point at the row that stays (same as R-3)
update public.moim_reports r set action_id = d.keep_id from moim_r5_dedup d where r.action_id = d.id;
update public.moim_sanctions set revoked_at = now(), revoked_by = null where id in (select id from moim_r5_dedup);
insert into public.moim_events (moim_id, actor_id, actor_kind, type, target_id, payload)
select d.moim_id, null, 'system', 'sanction_dedup', d.id, jsonb_build_object('level', d.level) from moim_r5_dedup d;

-- R-3 (new2): duplicate content_hide rows for one target -> keep the earliest, revoke the rest at their created_at
drop table if exists pg_temp.moim_r5_hide_dup;
create temp table moim_r5_hide_dup as
select id, keep_id from (
  select s.id, first_value(s.id) over (partition by s.target_id order by s.created_at, s.id) as keep_id,
         row_number() over (partition by s.target_id order by s.created_at, s.id) as rn
    from public.moim_sanctions s
   where s.level = 'content_hide' and s.revoked_at is null) z
 where rn > 1;
insert into public.moim_r5_backup_20271128 (tbl, row_id, row_data)
select 'moim_sanctions', s.id, to_jsonb(s) from public.moim_sanctions s where s.id in (select id from moim_r5_hide_dup)
on conflict do nothing;
insert into public.moim_r5_backup_20271128 (tbl, row_id, row_data)
select 'moim_reports', r.id, to_jsonb(r) from public.moim_reports r where r.action_id in (select id from moim_r5_hide_dup)
on conflict do nothing;
update public.moim_reports r set action_id = d.keep_id from moim_r5_hide_dup d where r.action_id = d.id;
update public.moim_sanctions set revoked_at = created_at, revoked_by = null where id in (select id from moim_r5_hide_dup);

-- R-5 (E14): an unfinished schedule whose host is no longer an active member -> the moim host
drop table if exists pg_temp.moim_r5_sched;
create temp table moim_r5_sched as
select s.id, s.moim_id, s.host_user_id as old_host, m.host_user_id as new_host, s.room_id
  from public.moim_schedules s
  join public.moims m on m.id = s.moim_id
  join public.moim_members mm on mm.moim_id = s.moim_id and mm.user_id = s.host_user_id
 where s.status in ('recruiting', 'full', 'closed') and mm.status <> 'active'
   and m.status = 'active' and m.host_user_id is not null and m.host_user_id <> s.host_user_id;
insert into public.moim_r5_backup_20271128 (tbl, row_id, row_data)
select 'moim_schedules', s.id, to_jsonb(s) from public.moim_schedules s where s.id in (select id from moim_r5_sched)
on conflict do nothing;
do $r5$
declare v record; v_mem record;
begin
  for v in select * from moim_r5_sched loop
    update public.moim_schedules set host_user_id = v.new_host, updated_at = now() where id = v.id;
    insert into public.moim_schedule_participants (schedule_id, user_id, status)
    values (v.id, v.new_host, 'confirmed')
    on conflict (schedule_id, user_id) do update set status = 'confirmed', updated_at = now();
    if v.room_id is not null then
      select nickname, avatar_url into v_mem from public.moim_members where moim_id = v.moim_id and user_id = v.new_host;
      perform public.moim__room_member_role(v.room_id, v.old_host, 'member');
      perform public.moim__room_member_activate(v.room_id, v.new_host, 'host', coalesce(v_mem.nickname, ''), v_mem.avatar_url);
      perform public.moim__room_member_role(v.room_id, v.new_host, 'host');
    end if;
    perform public.moim__schedule_refresh(v.id);
    perform public.moim__log(v.moim_id, null, 'system', 'schedule_host_reassigned', v.id,
                             jsonb_build_object('from', v.old_host, 'to', v.new_host, 'repair', 'r5'));
  end loop;
end
$r5$;

-- R-6 (D5, conditional K-10): only when the operator approved it for this apply (set dibay.moim_r5_r6 = 'on')
do $r5$
declare v_n int;
begin
  select count(*) into v_n from public.community_messenger_rooms
   where owner_domain = 'moim' and coalesce(room_status, 'active') <> 'active';
  if v_n > 0 and coalesce(current_setting('dibay.moim_r5_r6', true), '') = 'on' then
    insert into public.moim_r5_backup_20271128 (tbl, row_id, row_data)
    select 'community_messenger_rooms', r.id, to_jsonb(r) from public.community_messenger_rooms r
     where r.owner_domain = 'moim' and coalesce(r.room_status, 'active') <> 'active'
    on conflict do nothing;
    perform public.moim__writer_on();
    update public.community_messenger_rooms set room_status = 'active', updated_at = now()
     where owner_domain = 'moim' and coalesce(room_status, 'active') <> 'active';
  elsif v_n > 0 then
    raise notice 'moim_r5 R-6 skipped: % moim rooms with room_status <> active (needs approval)', v_n;
  end if;
end
$r5$;

-- R-7 (A18): moim room profile bio = the member's moim bio (active members, only rows that differ)
insert into public.moim_r5_backup_20271128 (tbl, row_id, row_data)
select 'community_messenger_room_profiles', rp.id, to_jsonb(rp)
  from public.community_messenger_room_profiles rp
  join public.community_messenger_rooms r on r.id = rp.room_id and r.owner_domain = 'moim'
  join public.moim_members mm on mm.moim_id = public.moim__room_moim_id(r.id) and mm.user_id = rp.user_id and mm.status = 'active'
 where rp.bio is distinct from left(coalesce(mm.bio, ''), 300)
on conflict do nothing;
do $r5$
begin
  perform public.moim__writer_on();
  update public.community_messenger_room_profiles rp
     set bio = left(coalesce(mm.bio, ''), 300), updated_at = now()
    from public.community_messenger_rooms r
    join public.moim_members mm on mm.moim_id = public.moim__room_moim_id(r.id)
   where rp.room_id = r.id and r.owner_domain = 'moim'
     and mm.user_id = rp.user_id and mm.status = 'active'
     and rp.bio is distinct from left(coalesce(mm.bio, ''), 300);
end
$r5$;

-- ===== 5. grants: new functions run as service_role only
revoke all on function public.moim__assert_image_url(text) from public, anon, authenticated;
grant execute on function public.moim__assert_image_url(text) to service_role;
revoke all on function public.moim__assert_birth_years(integer, integer) from public, anon, authenticated;
grant execute on function public.moim__assert_birth_years(integer, integer) to service_role;
revoke all on function public.moim__admin_assert_state(uuid, text) from public, anon, authenticated;
grant execute on function public.moim__admin_assert_state(uuid, text) to service_role;
revoke all on function public.moim__room_moim_id(uuid) from public, anon, authenticated;
grant execute on function public.moim__room_moim_id(uuid) to service_role;
revoke all on function public.moim_host_transfer_cancel(uuid, uuid) from public, anon, authenticated;
grant execute on function public.moim_host_transfer_cancel(uuid, uuid) to service_role;
revoke all on function public.moim_admin_log_room_action(uuid, uuid, text, uuid, text) from public, anon, authenticated;
grant execute on function public.moim_admin_log_room_action(uuid, uuid, text, uuid, text) to service_role;
revoke all on function public.moim_board_reorder(uuid, uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.moim_board_reorder(uuid, uuid, uuid[]) to service_role;
