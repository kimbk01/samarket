-- 2026-11-19 예약 작업 3번 (Owner 「1~4까지 같이 진행」) — 관리자 알림 발송 작업: 할 일 없는 실행 = DB 함수 1번.
-- 실측(11-18): 5분마다 287회 · Supabase 1,148건(1회당 4.0) — 정산 예외 검사 · 원본 재생 · 대기열 확보 · 푸시 재시도 확보.
-- 이 함수는 기존 함수 4개를 **같은 순서·같은 인자**로 부르고 결과(확보한 행 포함)를 그대로 돌려준다.
--   · 대기열(outbox)에서 확보한 행이 있으면 푸시 확보는 하지 않는다(push=null) → 앱이 대기열을 처리한 뒤 지금처럼 따로 확보.
--     (대기열 처리 중 새로 생긴 푸시 재시도 행을 같은 실행에서 확보하던 순서를 그대로 지키기 위함)
--   · 대기열이 비면 푸시 확보까지 여기서 한다.
-- 각 단계 실패는 서로 영향 없음(하위 블록). 권한: SECURITY INVOKER (지금과 같은 service_role).

create or replace function public.admin_notification_cron_tick(
  p_lookback interval default '72 hours',
  p_replay_limit integer default 200,
  p_batch integer default 20
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_settlement jsonb; v_settlement_err text;
  v_replayed integer; v_replay_err text;
  v_outbox jsonb; v_outbox_err text;
  v_push jsonb; v_push_err text;
begin
  begin v_settlement := public.store_commission_enqueue_exception_notifications();
  exception when others then v_settlement_err := sqlerrm; end;

  begin v_replayed := public.admin_notification_replay_support_replies(p_lookback, p_replay_limit);
  exception when others then v_replay_err := sqlerrm; end;

  begin
    select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) into v_outbox
    from public.admin_notification_outbox_claim(p_batch) r;
  exception when others then v_outbox_err := sqlerrm; v_outbox := '[]'::jsonb; end;

  if jsonb_array_length(v_outbox) = 0 then
    begin
      select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) into v_push
      from public.admin_notification_push_claim(p_batch) r;
    exception when others then v_push_err := sqlerrm; v_push := '[]'::jsonb; end;
  end if;

  return jsonb_build_object(
    'ok', true, 'v', 1,
    'settlement', v_settlement, 'settlement_error', v_settlement_err,
    'replayed', v_replayed, 'replay_error', v_replay_err,
    'outbox', v_outbox, 'outbox_error', v_outbox_err,
    'push', v_push, 'push_error', v_push_err
  );
end;
$$;

revoke all on function public.admin_notification_cron_tick(interval, integer, integer) from public, anon, authenticated;
grant execute on function public.admin_notification_cron_tick(interval, integer, integer) to service_role;
