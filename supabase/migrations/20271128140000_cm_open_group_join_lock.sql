-- 모임 감사 5번 묶음 P3 — 오픈채팅 비밀번호 입장: 방·계정마다 15분 안에 5번까지만 비밀번호를 검사하고, 5번째 시도에서 15분 잠금
-- 설계: docs/audit/moim-bundle5-design-2026-11-28.md (Owner 「구현 승인」 2026-11-28)
-- 운영에 Redis 가 없어 메모리 제한은 서버마다 따로 센다 → 운영 DB 에 센다.
-- 재감사 M1 반영: 비밀번호를 검사하기 **전에** 시도를 센다(한 문장). 동시에 여러 요청을 보내도 검사는 창마다 5번까지다.
-- 새 표·함수만 추가한다(기존 정의 변경 없음).
-- 롤백: drop function public.cm_open_group_join_begin(uuid, uuid); drop function public.cm_open_group_join_clear(uuid, uuid); drop table public.community_messenger_open_group_join_failures;

create table if not exists public.community_messenger_open_group_join_failures (
  room_id uuid not null references public.community_messenger_rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  fail_count integer not null default 0 check (fail_count >= 0),
  first_failed_at timestamptz not null default now(),
  locked_until timestamptz,
  primary key (room_id, user_id)
);

comment on table public.community_messenger_open_group_join_failures is
  '오픈채팅 비밀번호 입장 시도 기록 (모임 감사 5번 묶음). 성공하면 지운다. service_role 전용 — 클라이언트 정책 없음.';

alter table public.community_messenger_open_group_join_failures enable row level security;
revoke all on table public.community_messenger_open_group_join_failures from public, anon, authenticated;
grant select, insert, update, delete on table public.community_messenger_open_group_join_failures to service_role;

-- 비밀번호 검사 직전에 부른다. 한 문장(insert … on conflict do update)으로 시도를 +1 한다 — 동시 요청도 행 잠금으로 차례대로 센다.
-- 15분 창이 지났거나 잠금이 끝났으면 1부터 다시 센다. 잠금 중에는 잠금 끝 시각을 늘리지 않는다.
-- 세고 난 횟수가 5 이하면 {allowed:true} — 비밀번호를 검사한다. 5번째면 locked_until 을 함께 준다(틀리면 잠금 안내).
-- 6 이상이면 {allowed:false, locked_until} — 비밀번호를 검사하지 않는다.
create or replace function public.cm_open_group_join_begin(p_room uuid, p_user uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_window constant interval := interval '15 minutes';
  v_lock constant interval := interval '15 minutes';
  v_max constant integer := 5;
  v_count integer;
  v_locked timestamptz;
begin
  if p_room is null or p_user is null then
    raise exception 'invalid_argument' using errcode = '22023';
  end if;
  insert into public.community_messenger_open_group_join_failures as f (room_id, user_id, fail_count, first_failed_at, locked_until)
  values (p_room, p_user, 1, now(), null)
  on conflict (room_id, user_id) do update
    set fail_count = case
          when (f.locked_until is not null and f.locked_until <= now())
            or (f.locked_until is null and f.first_failed_at <= now() - v_window) then 1
          else f.fail_count + 1
        end,
        first_failed_at = case
          when (f.locked_until is not null and f.locked_until <= now())
            or (f.locked_until is null and f.first_failed_at <= now() - v_window) then now()
          else f.first_failed_at
        end,
        locked_until = case
          when (f.locked_until is not null and f.locked_until <= now())
            or (f.locked_until is null and f.first_failed_at <= now() - v_window) then null
          when f.locked_until is not null then f.locked_until
          when f.fail_count + 1 >= v_max then now() + v_lock
          else null
        end
  returning f.fail_count, f.locked_until into v_count, v_locked;
  return jsonb_build_object(
    'allowed', v_count <= v_max,
    'locked_until', case when v_locked is not null and v_locked > now() then v_locked else null end
  );
end
$function$;

-- 비밀번호가 맞으면 부른다: 시도 기록을 지운다(잠금도 풀린다).
create or replace function public.cm_open_group_join_clear(p_room uuid, p_user uuid)
 returns void
 language sql
 security definer
 set search_path to 'public'
as $function$
  delete from public.community_messenger_open_group_join_failures where room_id = p_room and user_id = p_user;
$function$;

revoke all on function public.cm_open_group_join_begin(uuid, uuid) from public, anon, authenticated;
revoke all on function public.cm_open_group_join_clear(uuid, uuid) from public, anon, authenticated;
grant execute on function public.cm_open_group_join_begin(uuid, uuid) to service_role;
grant execute on function public.cm_open_group_join_clear(uuid, uuid) to service_role;
