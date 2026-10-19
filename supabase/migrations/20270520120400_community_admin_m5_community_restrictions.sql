-- 커뮤니티 Admin M5 (C-14, O-3): 커뮤니티 경고·활동 제한을 기존 sanctions 에 기록 (세 번째 제재 원장을 만들지 않음).
-- scope='community' 는 커뮤니티 쓰기(글·댓글·신고·모임)만 막는다. 계정 정지(profiles.status)는 기존 그대로.
alter table public.sanctions
  add column if not exists scope text not null default 'platform',
  add column if not exists restriction text,
  add column if not exists revoked_at timestamptz,
  add column if not exists revoked_by uuid,
  add column if not exists revoke_reason text,
  add column if not exists source_report_id uuid,
  add column if not exists source_report_kind text;

alter table public.sanctions drop constraint if exists sanctions_sanction_type_check;
alter table public.sanctions add constraint sanctions_sanction_type_check
  check (sanction_type in ('warning', 'chat_ban', 'temp_suspend', 'permanent_ban', 'community_restriction'));

alter table public.sanctions drop constraint if exists sanctions_scope_check;
alter table public.sanctions add constraint sanctions_scope_check
  check (scope in ('platform', 'community'));

alter table public.sanctions drop constraint if exists sanctions_restriction_check;
alter table public.sanctions add constraint sanctions_restriction_check
  check (
    (sanction_type <> 'community_restriction' and restriction is null)
    or (sanction_type = 'community_restriction' and restriction in ('post', 'comment', 'all'))
  );

create index if not exists idx_sanctions_community_active
  on public.sanctions (user_id, end_at)
  where scope = 'community' and revoked_at is null;

-- 경고·활동 제한 기록. 같은 회원·같은 범위에 유효한 제한이 있으면 새로 만들지 않고 기존 행을 돌려준다.
-- p_days: null = 영구. 회원 행을 잠가 동시 요청에도 1건만 생긴다.
create or replace function public.admin_apply_community_sanction(
  p_user_id uuid,
  p_kind text,              -- 'warning' | 'community_restriction'
  p_restriction text,       -- 'post' | 'comment' | 'all' (경고는 null)
  p_days integer,
  p_reason text,
  p_actor_id uuid,
  p_source_report_id uuid default null,
  p_source_report_kind text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing record;
  v_id uuid;
  v_end timestamptz;
begin
  if (select auth.role()) is distinct from 'service_role' then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if p_user_id is null or p_actor_id is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
  end if;
  if coalesce(length(trim(p_reason)), 0) < 2 then
    return jsonb_build_object('ok', false, 'error', 'reason_required');
  end if;
  if p_kind not in ('warning', 'community_restriction') then
    return jsonb_build_object('ok', false, 'error', 'invalid_kind');
  end if;
  if p_kind = 'community_restriction' and coalesce(p_restriction, '') not in ('post', 'comment', 'all') then
    return jsonb_build_object('ok', false, 'error', 'invalid_restriction');
  end if;
  if p_days is not null and p_days < 1 then
    return jsonb_build_object('ok', false, 'error', 'invalid_days');
  end if;

  perform 1 from public.profiles where id = p_user_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'user_not_found');
  end if;

  if p_kind = 'community_restriction' then
    select id into v_existing
      from public.sanctions
     where user_id = p_user_id
       and scope = 'community'
       and sanction_type = 'community_restriction'
       and restriction = p_restriction
       and revoked_at is null
       and (end_at is null or end_at > now())
     limit 1;
    if found then
      return jsonb_build_object('ok', true, 'id', v_existing.id, 'duplicate', true);
    end if;
    v_end := case when p_days is null then null else now() + make_interval(days => p_days) end;
  end if;

  insert into public.sanctions
    (user_id, sanction_type, start_at, end_at, reason, created_by, scope, restriction,
     source_report_id, source_report_kind)
  values
    (p_user_id, p_kind, now(), v_end, left(trim(p_reason), 1000), p_actor_id, 'community',
     case when p_kind = 'community_restriction' then p_restriction else null end,
     p_source_report_id, p_source_report_kind)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id, 'duplicate', false, 'end_at', v_end);
end;
$$;

create or replace function public.admin_revoke_community_sanction(
  p_sanction_id uuid,
  p_actor_id uuid,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
begin
  if (select auth.role()) is distinct from 'service_role' then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if coalesce(length(trim(p_reason)), 0) < 2 then
    return jsonb_build_object('ok', false, 'error', 'reason_required');
  end if;
  update public.sanctions
     set revoked_at = now(), revoked_by = p_actor_id, revoke_reason = left(trim(p_reason), 1000)
   where id = p_sanction_id
     and scope = 'community'
     and revoked_at is null
  returning id, user_id into v_row;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_active');
  end if;
  return jsonb_build_object('ok', true, 'id', v_row.id, 'user_id', v_row.user_id);
end;
$$;

revoke all on function public.admin_apply_community_sanction(uuid, text, text, integer, text, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.admin_revoke_community_sanction(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.admin_apply_community_sanction(uuid, text, text, integer, text, uuid, uuid, text) to service_role;
grant execute on function public.admin_revoke_community_sanction(uuid, uuid, text) to service_role;
