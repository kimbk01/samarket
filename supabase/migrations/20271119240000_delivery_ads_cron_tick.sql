-- 2026-11-19 예약 작업 1번 (Owner 「1번부터 승인」) — 광고 일정 전환 작업: 할 일 없는 실행 = DB 함수 1번.
-- 설계: docs/audit/supabase-request-surge-2026-11-18/cron-due-tick-design-2026-11-19.md
--
-- 실측(11-18): 5분마다 288회 · Supabase 2,930건(1회당 10.2) — 할 일이 없어도 후보 표 조회 최대 8번 + 정리 RPC 3번.
-- 이 함수:
--   1) 광고 일정 후보가 하나라도 있는지(앱 코드 loadDueCandidates 의 8가지 조건과 같은 조건 · 상위 집합) 확인
--   2) 후보가 **없을 때만** 기존 정리 함수 3개(파트너 만료 · 쿠폰 종료 · 쿠폰 만료)를 그대로 불러 결과를 돌려준다
--   후보가 **있으면** 아무것도 하지 않고 schedule_due=true 만 돌려준다 → 앱이 지금과 같은 순서(승격 → 정리 3개)로 처리.
-- 판정·처리 규칙은 옮기지 않는다(기존 함수 호출만). 각 정리 함수 실패는 서로 영향 없음(하위 블록).
-- 권한: SECURITY INVOKER — 지금과 같은 service_role 권한으로 같은 함수를 부른다.

create or replace function public.delivery_ads_cron_tick(
  p_partner_limit integer default 200,
  p_coupon_end_limit integer default 500,
  p_coupon_expire_limit integer default 500
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := now();
  c_apply_from constant timestamptz := '2026-10-20T20:30:00Z';
  v_due boolean;
  v_partner jsonb;
  v_coupon_end jsonb;
  v_coupon_expire jsonb;
begin
  select
    exists (select 1 from public.store_paid_ad_campaigns c
            where (c.lifecycle_status = 'SCHEDULED' and c.start_at <= v_now and c.end_at > v_now)
               or (c.lifecycle_status in ('ACTIVE','SCHEDULED') and c.end_at <= v_now)
               or (c.lifecycle_status in ('PAUSED_OWNER','PAUSED_ADMIN') and c.end_at <= v_now and c.end_at >= c_apply_from)
               or (c.lifecycle_status in ('SUBMITTED','UNDER_REVIEW','CHANGES_REQUESTED') and c.end_at <= v_now and c.submitted_at >= c_apply_from))
    or
    exists (select 1 from public.store_banner_ad_campaigns c
            where (c.lifecycle_status = 'SCHEDULED' and c.start_at <= v_now and c.end_at > v_now)
               or (c.lifecycle_status in ('ACTIVE','SCHEDULED') and c.end_at <= v_now)
               or (c.lifecycle_status in ('PAUSED_OWNER','PAUSED_ADMIN') and c.end_at <= v_now and c.end_at >= c_apply_from)
               or (c.lifecycle_status in ('SUBMITTED','UNDER_REVIEW','CHANGES_REQUESTED') and c.end_at <= v_now and c.submitted_at >= c_apply_from))
  into v_due;

  if v_due then
    return jsonb_build_object('ok', true, 'v', 1, 'schedule_due', true);
  end if;

  begin
    v_partner := public.delivery_ad_partner_membership_expire_due(p_partner_limit);
  exception when others then
    v_partner := jsonb_build_object('ok', false, 'error', sqlerrm);
  end;

  begin
    v_coupon_end := public.store_coupon_campaigns_auto_end_expired(p_coupon_end_limit);
  exception when others then
    v_coupon_end := jsonb_build_object('error', sqlerrm);
  end;

  begin
    v_coupon_expire := public.expire_stale_coupon_entitlements(p_coupon_expire_limit);
  exception when others then
    v_coupon_expire := jsonb_build_object('error', sqlerrm);
  end;

  return jsonb_build_object(
    'ok', true,
    'v', 1,
    'schedule_due', false,
    'partner', coalesce(v_partner, 'null'::jsonb),
    'coupon_auto_end', coalesce(v_coupon_end, 'null'::jsonb),
    'coupon_expire', coalesce(v_coupon_expire, 'null'::jsonb)
  );
end;
$$;

revoke all on function public.delivery_ads_cron_tick(integer, integer, integer) from public, anon, authenticated;
grant execute on function public.delivery_ads_cron_tick(integer, integer, integer) to service_role;
