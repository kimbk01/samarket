-- X-4 (문서 K, 2026-10-21 PHT) — 운영 누락분만 최소 보완. 운영 적용 완료(apply 도구), 버전 기록 일치.
-- 원본: 20260516120000_delivery_operations_recovery_center.sql / 20260826180000_free_coupon_v32_authority_lifecycle.sql
-- 차이: DROP POLICY·pg_cron 블록 제외(운영에 pg_cron 없음), 실행 권한 service_role 전용(anon·authenticated 회수),
--       복구 로그 정책 SELECT 전용 + 클라이언트 쓰기 회수(1-D 직접 쓰기 차단 원칙). 데이터 변경 0.

CREATE OR REPLACE FUNCTION public.revoke_campaign_active_entitlements(
  p_campaign_id uuid,
  p_actor_user_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ent record;
  v_revoked int := 0;
  v_reserved_released numeric := 0;
BEGIN
  IF p_campaign_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_campaign_id');
  END IF;

  PERFORM 1 FROM public.store_coupon_campaigns WHERE id = p_campaign_id FOR UPDATE;

  FOR v_ent IN
    SELECT id, reserved_php
      FROM public.coupon_user_entitlements
     WHERE campaign_id = p_campaign_id
       AND status IN ('available', 'restored')
     FOR UPDATE
  LOOP
    UPDATE public.coupon_user_entitlements
       SET status = 'revoked',
           updated_at = now()
     WHERE id = v_ent.id
       AND status IN ('available', 'restored');

    IF FOUND THEN
      UPDATE public.store_coupon_campaigns
         SET reserved_spend_php = greatest(0, reserved_spend_php - v_ent.reserved_php),
             updated_at = now()
       WHERE id = p_campaign_id;
      v_revoked := v_revoked + 1;
      v_reserved_released := v_reserved_released + coalesce(v_ent.reserved_php, 0);
      INSERT INTO public.coupon_audit_events (campaign_id, entitlement_id, actor_user_id, action, payload)
      VALUES (
        p_campaign_id,
        v_ent.id,
        p_actor_user_id,
        'revoke',
        jsonb_build_object('reason', coalesce(p_reason, ''), 'reserved_released', v_ent.reserved_php)
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'revoked_count', v_revoked,
    'reserved_released', v_reserved_released
  );
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_campaign_active_entitlements(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_campaign_active_entitlements(uuid, uuid, text) TO service_role;
