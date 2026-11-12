-- 모임 운영 정책 실행 4종 (Owner 2026-11-12 「4개 구현」 — docs/design/moim/moim-policy-values-proposal-2026-11-12.md §2)
-- 어드민 「운영 정책」 값 중 저장만 되고 실행 코드가 없던 4개를 실행한다. 값이 NULL 이면 아무것도 하지 않는다.
--  1) join_request_expire_days   — 대기 가입 신청 만료 (설계 §6 P3 「대기 신청은 14일 뒤 expired」, 알림 없음 — §7 매트릭스에 없음)
--  2) schedule_room_archive_days — 끝난 일정 방을 참여자 목록에서 보관 (설계 §6 「일정이 끝나면 읽기 전용, N일 뒤 목록에서 보관」)
--  3) closed_retention_days      — 종료 모임: 멤버 열람 기간이 지나면 모임 방 전부 보관 + 열람 종료 표시 (설계 P15 「멤버만 N일 기록 열람, 그 뒤 목록에서 사라짐」)
--  4) inactive_unlist_days       — 마지막 활동이 N일 지난 모임은 동네 목록·검색에서 빠진다 (읽을 때 판정 — 상태 변경 없음, 활동이 생기면 바로 다시 보임)
-- 보관 = 메신저 참가자별 보관함(is_archived) — 방·멤버십은 그대로(읽기 전용 방이라 새 메시지로 보관이 풀리지 않음).
begin;

alter table public.moim_schedules add column if not exists room_archived_at timestamptz null;
alter table public.moims add column if not exists retention_ended_at timestamptz null;

/** 모임 방 보관 — 방 참가자 전원(나가지 않은 사람)의 보관함으로. 반환: 바뀐 참가자 수 */
create or replace function public.moim__rooms_archive(p_rooms uuid[]) returns int
language plpgsql volatile security definer set search_path = public as $$
declare v_n int;
begin
  if p_rooms is null or cardinality(p_rooms) = 0 then return 0; end if;
  perform public.moim__writer_on();
  update public.community_messenger_participants
     set is_archived = true
   where room_id = any (p_rooms) and left_at is null and not is_archived;
  get diagnostics v_n = row_count;
  return v_n;
end
$$;

/** 1) 대기 가입 신청 만료 */
create or replace function public.moim_join_requests_expire_due(p_limit int default 200) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_days int;
  v_r record;
  v_n int := 0;
begin
  select join_request_expire_days into v_days from public.moim_policies where id = 1;
  if v_days is null then return jsonb_build_object('ok', true, 'expired', 0, 'policy', null); end if;
  for v_r in
    select * from public.moim_join_requests
     where status = 'pending' and created_at <= now() - make_interval(days => v_days)
     order by created_at
     limit greatest(1, least(p_limit, 1000))
     for update skip locked
  loop
    update public.moim_join_requests set status = 'expired', decided_at = now() where id = v_r.id;
    update public.moim_members set status = 'cancelled', updated_at = now()
     where moim_id = v_r.moim_id and user_id = v_r.user_id and status = 'pending';
    perform public.moim__log(v_r.moim_id, null, 'system', 'join_expired', v_r.id, jsonb_build_object('user_id', v_r.user_id, 'days', v_days));
    v_n := v_n + 1;
  end loop;
  return jsonb_build_object('ok', true, 'expired', v_n, 'policy', v_days);
end
$$;

/** 2) 끝난 일정 방 보관 */
create or replace function public.moim_schedule_rooms_archive_due(p_limit int default 200) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_days int;
  v_s record;
  v_n int := 0;
begin
  select schedule_room_archive_days into v_days from public.moim_policies where id = 1;
  if v_days is null then return jsonb_build_object('ok', true, 'archived', 0, 'policy', null); end if;
  for v_s in
    select s.* from public.moim_schedules s
     where s.status = 'done' and s.room_archived_at is null
       and coalesce(s.finished_at, s.updated_at) <= now() - make_interval(days => v_days)
     order by coalesce(s.finished_at, s.updated_at)
     limit greatest(1, least(p_limit, 1000))
     for update skip locked
  loop
    if v_s.room_id is not null then perform public.moim__rooms_archive(array[v_s.room_id]); end if;
    update public.moim_schedules set room_archived_at = now() where id = v_s.id;
    perform public.moim__log(v_s.moim_id, null, 'system', 'schedule_room_archived', v_s.id, jsonb_build_object('days', v_days));
    v_n := v_n + 1;
  end loop;
  return jsonb_build_object('ok', true, 'archived', v_n, 'policy', v_days);
end
$$;

/** 3) 종료 모임 열람 기간 끝 — 모임 방(전체 방 + 일정 방) 보관, 열람 종료 표시 */
create or replace function public.moim_closed_retention_due(p_limit int default 100) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_days int;
  v_m record;
  v_rooms uuid[];
  v_n int := 0;
begin
  select closed_retention_days into v_days from public.moim_policies where id = 1;
  if v_days is null then return jsonb_build_object('ok', true, 'ended', 0, 'policy', null); end if;
  for v_m in
    select m.* from public.moims m
     where m.status = 'closed' and m.retention_ended_at is null and m.closed_at is not null
       and m.closed_at <= now() - make_interval(days => v_days)
     order by m.closed_at
     limit greatest(1, least(p_limit, 500))
     for update skip locked
  loop
    select array_remove(array_agg(distinct r), null) into v_rooms from (
      select v_m.main_room_id as r
      union all
      select room_id from public.moim_schedules where moim_id = v_m.id and room_id is not null
    ) x;
    perform public.moim__rooms_archive(v_rooms);
    update public.moim_schedules set room_archived_at = coalesce(room_archived_at, now()) where moim_id = v_m.id and room_id is not null;
    update public.moims set retention_ended_at = now() where id = v_m.id;
    perform public.moim__log(v_m.id, null, 'system', 'closed_retention_ended', v_m.id, jsonb_build_object('days', v_days));
    v_n := v_n + 1;
  end loop;
  return jsonb_build_object('ok', true, 'ended', v_n, 'policy', v_days);
end
$$;

-- 실행 권한: service_role 만
do $grant$
declare f record;
begin
  for f in
    select p.oid::regprocedure sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('moim__rooms_archive', 'moim_join_requests_expire_due', 'moim_schedule_rooms_archive_due', 'moim_closed_retention_due')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end
$grant$;

commit;
