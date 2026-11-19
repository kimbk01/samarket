-- 2026-11-19 예약 작업 4번 (Owner 「1~4까지 같이 진행」) — 주문 SLA 검사: 실행 1번 = DB 함수 1번.
-- 실측(11-18): 5분마다 288회 · Supabase 577건(1회당 2.0) — 검사 + 하트비트.
-- 기존 순서·규칙 그대로: 검사가 성공한 실행만 하트비트를 남긴다. 검사 실패면 ok=false(앱이 지금처럼 500).
-- 하트비트 실패는 결과에만 적는다(지금도 로그만). 권한: SECURITY INVOKER.

create or replace function public.store_orders_sla_scan_tick()
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_hb_err text;
begin
  begin
    perform public.scan_store_order_sla_warnings();
  exception when others then
    return jsonb_build_object('ok', false, 'v', 1, 'error', sqlerrm);
  end;
  begin
    perform public.touch_delivery_operation_job_heartbeat('sla_scan', true, jsonb_build_object('source', 'vercel_cron'));
  exception when others then v_hb_err := sqlerrm; end;
  return jsonb_build_object('ok', true, 'v', 1, 'heartbeat_error', v_hb_err);
end;
$$;

revoke all on function public.store_orders_sla_scan_tick() from public, anon, authenticated;
grant execute on function public.store_orders_sla_scan_tick() to service_role;
