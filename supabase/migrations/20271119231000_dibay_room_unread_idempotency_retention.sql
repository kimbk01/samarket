-- 2026-11-19 재감사 D (Owner 「C·D 진행」) — 읽음·보내기 중복 방지 기록 보존 기한.
--
-- 실측(운영 읽기 전용, 11-19): 10,048행 · 11 MB · 2026-07-31 이후 삭제 0건 · 하루 약 225행. 정리 작업이 없었다.
-- 기록의 쓰임: 같은 요청을 짧은 시간 안에 다시 보냈을 때 같은 결과를 돌려주는 것(재시도·연타).
--   · 읽음 키 = 사용자·방·끝 메시지 → 지워진 뒤 같은 키가 오면 그냥 다시 읽음 처리(이미 읽었으면 아무 변화 없음).
--   · 보내기 키 = 사용자·방·client_message_id 등 → 메시지 표의 고유 색인(room, sender, client_message_id)이 중복을 따로 막는다.
--   → 7일 넘은 기록을 지워도 동작 변화 없음. 오래된 결과를 「재전송」으로 돌려주는 일은 오히려 줄어든다.
-- 실행: 매일 메신저 정리 예약 작업(/api/cron/messenger-contacts-maintenance, 04:10 PHT)이 1번 호출.
-- 한 번에 최대 p_max_rows 행만 지운다(긴 잠금 방지). 남으면 다음 날 이어서 지운다.

create or replace function public.dibay_purge_room_unread_idempotency(
  p_keep_days integer default 7,
  p_max_rows integer default 50000
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_keep integer := greatest(coalesce(p_keep_days, 7), 1);
  v_max integer := least(greatest(coalesce(p_max_rows, 50000), 1), 200000);
  v_deleted integer;
begin
  with doomed as (
    select i.ctid
    from public.dibay_room_unread_idempotency i
    where i.created_at < now() - make_interval(days => v_keep)
    limit v_max
  )
  delete from public.dibay_room_unread_idempotency t
  using doomed d
  where t.ctid = d.ctid;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.dibay_purge_room_unread_idempotency(integer, integer) from public, anon, authenticated;
grant execute on function public.dibay_purge_room_unread_idempotency(integer, integer) to service_role;
