-- 2026-11-21 메시지 보내기 2단계 (Owner 「구현 승인」) — 받는 사람별 DB 작업을 보내기 1번당 함수 1번으로.
-- 설계: docs/audit/supabase-request-surge-2026-11-18/message-send-fanout-stage2-design-2026-11-21.md
--
-- 1) 「바뀜 표시」 열: invalidated_at > updated_at 이면 그 사본은 틀림 → 읽는 쪽이 즉시 다시 만든다(앱 코드).
-- 2) mark_messenger_snapshots_dirty: 홈 목록·허브 배지 사본에 바뀜 표시(사람 수와 무관하게 1번).
-- 3) invalidate_cm_bootstrap_snapshot_watermarks: 기존 invalidate_cm_bootstrap_snapshot_watermark 를
--    사람마다 그대로 부른다(같은 잠금·같은 행). id 순으로 불러 잠금 순서를 고정(교착 방지).
-- 4) upsert_notification_target_unread_many: 기존 upsert_notification_target_unread(7인자)를 사람마다 그대로 부르고
--    「처음 안 읽음이 된 사람」·「실패한 사람」 목록을 돌려준다(실패한 사람은 앱이 기존처럼 한 명씩 다시 처리).
-- 규칙은 옮기지 않는다(기존 함수 호출만). 함수가 없으면 앱은 기존 경로(사람마다 호출·즉시 재생성).

alter table public.community_messenger_home_sync_snapshots
  add column if not exists invalidated_at timestamptz;
alter table public.hub_badge_user_unread_counters
  add column if not exists invalidated_at timestamptz;

create or replace function public.mark_messenger_snapshots_dirty(
  p_home_user_ids uuid[] default '{}',
  p_hub_user_ids uuid[] default '{}'
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_home integer := 0;
  v_hub integer := 0;
begin
  if coalesce(array_length(p_home_user_ids, 1), 0) > 0 then
    update public.community_messenger_home_sync_snapshots s
       set invalidated_at = v_now
     where s.user_id = any(p_home_user_ids);
    get diagnostics v_home = row_count;
  end if;
  if coalesce(array_length(p_hub_user_ids, 1), 0) > 0 then
    update public.hub_badge_user_unread_counters c
       set invalidated_at = v_now
     where c.user_id = any(p_hub_user_ids);
    get diagnostics v_hub = row_count;
  end if;
  return jsonb_build_object('ok', true, 'v', 1, 'home', v_home, 'hub', v_hub);
end;
$$;

create or replace function public.invalidate_cm_bootstrap_snapshot_watermarks(p_user_ids uuid[])
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_n integer := 0;
begin
  for v_id in
    select distinct u from unnest(coalesce(p_user_ids, '{}'::uuid[])) as u where u is not null order by u
  loop
    perform public.invalidate_cm_bootstrap_snapshot_watermark(v_id);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

create or replace function public.upsert_notification_target_unread_many(
  p_user_ids uuid[],
  p_target_type text,
  p_target_id text,
  p_scope text,
  p_store_id uuid,
  p_meta jsonb,
  p_room_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_changed uuid[] := '{}';
  v_failed uuid[] := '{}';
  v_res boolean;
begin
  for v_id in
    select distinct u from unnest(coalesce(p_user_ids, '{}'::uuid[])) as u where u is not null order by u
  loop
    begin
      v_res := public.upsert_notification_target_unread(
        v_id, p_target_type, p_target_id, p_scope, p_store_id, p_meta, p_room_id
      );
      if v_res is distinct from false then
        v_changed := v_changed || v_id;
      end if;
    exception when others then
      v_failed := v_failed || v_id;
    end;
  end loop;
  return jsonb_build_object('ok', true, 'v', 1, 'changed', to_jsonb(v_changed), 'failed', to_jsonb(v_failed));
end;
$$;

revoke all on function public.mark_messenger_snapshots_dirty(uuid[], uuid[]) from public, anon, authenticated;
grant execute on function public.mark_messenger_snapshots_dirty(uuid[], uuid[]) to service_role;
revoke all on function public.invalidate_cm_bootstrap_snapshot_watermarks(uuid[]) from public, anon, authenticated;
grant execute on function public.invalidate_cm_bootstrap_snapshot_watermarks(uuid[]) to service_role;
revoke all on function public.upsert_notification_target_unread_many(uuid[], text, text, text, uuid, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.upsert_notification_target_unread_many(uuid[], text, text, text, uuid, jsonb, uuid) to service_role;
