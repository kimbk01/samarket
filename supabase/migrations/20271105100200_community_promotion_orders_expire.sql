-- 광고 수정 설계 2026-11-04 · D-9 (커뮤니티 상위노출 만료 — 거래와 같은 방식)
-- 근거: docs/audit/ads-fix-design-2026-11-04.md §4 D-9 · PB-45
-- 운영 expire_trade_promotion_orders() (2026-11-04 pg_get_functiondef 확인) 와 같은 구조:
--   service_role 만 · 기간 지난 active → expired · 행마다 잠금(skip locked) · 500행씩 · 감사 1행 · 환급 없음.
--   다른 점: domain = 'community' · 감사 이름 community_promotion_order.expire (audit_logs 직접 — 커뮤니티 감사 함수가 없음).
--   paused 주문은 기간이 멈춰 있으므로 대상이 아니다(거래와 같음).
-- 운영 대상 수(2026-11-04 SELECT): domain='community' and order_status='active' and end_at < now() → 0행 (커뮤니티 active 0행).
-- 호출: cron 라우트 /api/cron/community-promotion-orders-expire (담당 P) → rpc('community_promotion_orders_expire')
--
-- 롤백 SQL
--   drop function if exists public.community_promotion_orders_expire();

create or replace function public.community_promotion_orders_expire()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
  v_n integer := 0;
begin
  if (select auth.role()) is distinct from 'service_role' then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  for v_row in
    select id, end_at from public.point_promotion_orders
     where domain = 'community' and order_status = 'active' and end_at < now()
     order by end_at
     limit 500
     for update skip locked
  loop
    update public.point_promotion_orders
       set order_status = 'expired', ended_at = coalesce(ended_at, v_row.end_at),
           end_reason_code = coalesce(end_reason_code, 'expired')
     where id = v_row.id and order_status = 'active';
    insert into public.audit_logs (actor_type, actor_id, target_type, target_id, action, before_json, after_json)
    values ('system', null, 'community_promotion_order', v_row.id::text, 'community_promotion_order.expire',
            jsonb_build_object('order_status', 'active', 'end_at', v_row.end_at),
            jsonb_build_object('order_status', 'expired'));
    v_n := v_n + 1;
  end loop;
  return jsonb_build_object('ok', true, 'expired', v_n);
end;
$$;

revoke all on function public.community_promotion_orders_expire() from public, anon, authenticated;
grant execute on function public.community_promotion_orders_expire() to service_role;
