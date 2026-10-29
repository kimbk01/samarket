-- v4 W5 · DB-03 (2026-10-29 PHT) — 20260826180000_free_coupon_v32_authority_lifecycle 운영 누락 함수 2개 멱등 재적용.
--
-- 운영 확인(READ ONLY, 2026-10-29): expire_stale_coupon_entitlements(integer)·reconcile_coupon_campaign_issued(uuid)
--   없음 → 기간 지난 쿠폰 21건이 status='available' 로 남고 캠페인 reserved_spend_php ₱2,464 묶임.
--   테이블 현 스키마(coupon_user_entitlements.status/reserved_php/expires_at/updated_at,
--   store_coupon_campaigns.reserved_spend_php/issued_count/updated_at, coupon_audit_events.action/payload) 와 일치 확인.
--   pg_cron 없음 → 만료 배치는 Vercel cron `/api/cron/delivery-ads-schedule-transitions`(기존 쿠폰 lifecycle 크론)가 호출.
--
-- 원본과 차이:
--   · pg_cron 등록 블록 제외(운영 pg_cron 없음 — X-4 와 같은 처리).
--   · EXECUTE = service_role 전용(원본은 authenticated 포함). 만료 함수는 SECURITY DEFINER 쓰기 함수라 일반 로그인
--     사용자 호출 경로를 두지 않는다(X-4 revoke_campaign_active_entitlements 와 같은 권한 원칙). 앱 코드는 이 두 함수를
--     클라이언트 세션으로 부르지 않는다.
--   · 함수 본문은 원본 그대로 (만료 시 entitlement.status='expired' + 캠페인 reserved_spend_php 에서 그 쿠폰
--     reserved_php 차감(0 하한) + coupon_audit_events 'expire' 1건, 같은 트랜잭션).
--
-- 데이터 변경: 이 파일은 함수 정의만. 기존 만료 21건 정리는 scripts/delivery-v4/db03-expire-stale-coupons.sql (1회 실행).
--
-- 롤백:
--   drop function if exists public.expire_stale_coupon_entitlements(integer);
--   drop function if exists public.reconcile_coupon_campaign_issued(uuid);

CREATE OR REPLACE FUNCTION public.reconcile_coupon_campaign_issued(p_campaign_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_issued int;
  v_count int;
BEGIN
  IF p_campaign_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_campaign_id');
  END IF;
  SELECT issued_count INTO v_issued
    FROM public.store_coupon_campaigns
   WHERE id = p_campaign_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'campaign_not_found');
  END IF;
  SELECT count(*)::int INTO v_count
    FROM public.coupon_user_entitlements
   WHERE campaign_id = p_campaign_id;
  RETURN jsonb_build_object(
    'ok', true,
    'campaign_id', p_campaign_id,
    'issued_count', coalesce(v_issued, 0),
    'entitlement_count', coalesce(v_count, 0),
    'consistent', coalesce(v_issued, 0) = coalesce(v_count, 0)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.expire_stale_coupon_entitlements(p_batch_limit integer DEFAULT 500)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ent record;
  v_expired int := 0;
  v_reserved_released numeric := 0;
BEGIN
  FOR v_ent IN
    SELECT e.id, e.campaign_id, e.reserved_php
      FROM public.coupon_user_entitlements e
     WHERE e.status IN ('available', 'restored')
       AND e.expires_at <= clock_timestamp()
     ORDER BY e.expires_at ASC
     LIMIT greatest(1, least(coalesce(p_batch_limit, 500), 5000))
     FOR UPDATE OF e
  LOOP
    UPDATE public.coupon_user_entitlements
       SET status = 'expired',
           updated_at = now()
     WHERE id = v_ent.id
       AND status IN ('available', 'restored');

    IF FOUND THEN
      UPDATE public.store_coupon_campaigns
         SET reserved_spend_php = greatest(0, reserved_spend_php - v_ent.reserved_php),
             updated_at = now()
       WHERE id = v_ent.campaign_id;
      v_expired := v_expired + 1;
      v_reserved_released := v_reserved_released + coalesce(v_ent.reserved_php, 0);
      INSERT INTO public.coupon_audit_events (campaign_id, entitlement_id, action, payload)
      VALUES (
        v_ent.campaign_id,
        v_ent.id,
        'expire',
        jsonb_build_object('reserved_released', v_ent.reserved_php)
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'expired_count', v_expired,
    'reserved_released', v_reserved_released
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_coupon_campaign_issued(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reconcile_coupon_campaign_issued(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_coupon_campaign_issued(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.expire_stale_coupon_entitlements(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.expire_stale_coupon_entitlements(integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_stale_coupon_entitlements(integer) TO service_role;
