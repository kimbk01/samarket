-- 상품권 2-D GFT-01 (문서 G-1 §5-D, 2026-10-20) — gift_certificate_redemption_reverse 주문 상태 가드 + service_role 직접 EXECUTE 회수
-- 근거(운영 ckdosyydvgzqwpbwuhon 읽기 전용 조회 2026-10-21 PHT):
--   * 운영 원문 md5(prosrc) = da8e00cd131551f5454712b7571513df (SECURITY DEFINER · owner postgres · search_path=public
--     · ACL {postgres=X/postgres,service_role=X/postgres}). 주문 상태 확인 없음 → 진행 중 주문의 상품권 사용이 직접 호출로 역처리됨
--     (2026-09-17 6건 + 08-28 1건, pending). D-5: 그 7주문은 정리·재차감하지 않는다(데이터 변경 0).
--   * 운영에서 이 함수를 부르는 함수 = gift_certificate_cancel_order_restore, gift_certificate_refund_order_atomic 2개뿐
--     (둘 다 SECURITY DEFINER · owner postgres → REVOKE 후에도 소유자 권한으로 호출 가능).
--   * 앱 TS(app/·lib/·components/) 직접 호출 0건 (lib/gift-certificate/gift-certificate-schema.ts 의 이름 상수만, 사용처 0).
--     scripts/qa/*-production-proof / currency-cut-b-production-close 의 과거 증명 스크립트만 직접 호출 → 실행 시 permission denied (의도).
--   * 순서 정합: 운영 gift_certificate_refund_order_atomic 은 order_status='refund_requested' 상태에서 역처리를 먼저 부르고
--     (실패 시 RAISE 로 전체 롤백) 그 다음 refunded 로 UPDATE 한다. 그래서 가드는 cancelled / refunded / payment_status=failed
--     + refund_requested(G10 래퍼의 갱신 직전 상태)를 허용한다. 직접 호출 경로는 EXECUTE 회수로 막히므로 refund_requested 는
--     래퍼 경유로만 도달한다. 래퍼가 상태 UPDATE 후 호출하도록 바뀌면(2-C) refund_requested 허용을 뺄 수 있다.
-- 수정(최소 diff): 인자 확인 직후 store_orders 행 FOR UPDATE 잠금 + 상태 가드
--   ({ok:false, error:'order_not_found'} / {ok:false, error:'order_not_terminal', order_status, payment_status}).
--   이하 본문은 운영 원문 그대로. 멱등(이미 역처리 → reversed_count 0, idempotent true) 불변. 래퍼 2개는 이 파일에서 수정하지 않음.
-- 함수 본문에는 비 ASCII 문자를 넣지 않는다 (운영 적용 도구가 멈춤).
-- 롤백:
--   운영 원문(md5 da8e00cd131551f5454712b7571513df) = supabase/migrations/20270421120300_finance_ssot19_d2_gift.sql 의
--   gift_certificate_redemption_reverse 정의를 그대로 재실행 후
--   GRANT EXECUTE ON FUNCTION public.gift_certificate_redemption_reverse(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.gift_certificate_redemption_reverse(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_red public.gift_certificate_redemptions%ROWTYPE;
  v_inst public.gift_certificate_instances%ROWTYPE;
  v_avail_before integer;
  v_shortfall integer;
  v_cash_balance integer;
  v_debit integer;
  v_new_cash integer;
  v_restored integer;
  v_new_status text;
  v_count integer := 0;
  v_obligation_id uuid;
  v_has_coin_credit boolean;
  v_order_status text;
  v_payment_status text;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_order_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_args');
  END IF;

  -- GFT-01: reverse only for terminal orders. refund_requested = G10 refund wrapper (reverse before its refunded UPDATE).
  SELECT so.order_status, so.payment_status
    INTO v_order_status, v_payment_status
    FROM public.store_orders so
   WHERE so.id = p_order_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'order_not_found');
  END IF;
  IF v_order_status NOT IN ('cancelled', 'refunded', 'refund_requested')
     AND coalesce(v_payment_status, '') IS DISTINCT FROM 'failed' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'order_not_terminal',
      'order_status', v_order_status,
      'payment_status', v_payment_status
    );
  END IF;

  FOR v_red IN
    SELECT * FROM public.gift_certificate_redemptions
     WHERE order_id = p_order_id
       AND reversed = false
     ORDER BY created_at
     FOR UPDATE
  LOOP
    v_count := v_count + 1;

    SELECT * INTO v_inst
      FROM public.gift_certificate_instances
     WHERE id = v_red.instance_id
     FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'gift_reverse_instance_not_found redemption=%', v_red.id;
    END IF;

    -- Restore redeemed + forfeited face (one-time extinguish reversed on cancel).
    v_restored := least(
      v_inst.face_value,
      v_inst.remaining_balance
        + v_red.redeemed_amount
        + coalesce(v_red.forfeited_amount, 0)
    );
    IF v_restored = v_inst.face_value THEN
      v_new_status := 'ACTIVE';
    ELSIF v_restored > 0 THEN
      -- Historical compat only (new redeem path never leaves PARTIALLY_REDEEMED).
      v_new_status := 'PARTIALLY_REDEEMED';
    ELSE
      v_new_status := 'FULLY_REDEEMED';
    END IF;

    UPDATE public.gift_certificate_instances
       SET remaining_balance = v_restored,
           status = CASE
             WHEN status = 'GIFT_LOCKED' THEN 'GIFT_LOCKED'
             ELSE v_new_status
           END,
           version = version + 1,
           fully_redeemed_at = CASE WHEN v_restored > 0 THEN NULL ELSE fully_redeemed_at END
     WHERE id = v_inst.id;

    UPDATE public.gift_certificate_redemptions
       SET reversed = true,
           reversed_at = now()
     WHERE id = v_red.id;

    INSERT INTO public.gift_certificate_ledger (
      instance_id, store_id, user_id, entry_type, amount,
      related_type, related_id, description, actor_type
    ) VALUES (
      v_red.instance_id, v_red.store_id, v_red.buyer_user_id, 'REDEEM_REVERSE', v_red.redeemed_amount,
      'gift_certificate_redemption_reverse', v_red.id::text, 'Redemption reversed', 'system'
    );

    IF coalesce(v_red.forfeited_amount, 0) > 0 THEN
      INSERT INTO public.gift_certificate_ledger (
        instance_id, store_id, user_id, entry_type, amount,
        related_type, related_id, description, actor_type
      ) VALUES (
        v_red.instance_id, v_red.store_id, v_red.buyer_user_id, 'FORFEIT_REVERSE',
        v_red.forfeited_amount,
        'gift_certificate_redemption_reverse', v_red.id::text,
        'Forfeiture reversed', 'system'
      );
    END IF;

    PERFORM public.gift_certificate_promo_reverse_for_redemption(v_red.id);

    IF EXISTS (
      SELECT 1 FROM public.gift_certificate_revenue_ledger rl
       WHERE rl.redemption_id = v_red.id
         AND rl.entry_type = 'REVENUE_AVAILABLE'
    ) THEN
      INSERT INTO public.gift_certificate_revenue_ledger (
        store_id, redemption_id, entry_type, amount, related_type, related_id
      ) VALUES (
        v_red.store_id, v_red.id, 'REVERSED', -v_red.merchant_net_amount,
        'redemption_reverse', v_red.id::text
      );

      SELECT EXISTS (
        SELECT 1
          FROM public.store_economic_point_ledger l
         WHERE l.store_id = v_red.store_id
           AND l.entry_kind = 'GIFT_REDEMPTION_EARN'
           AND l.related_type = 'gift_redemption'
           AND l.related_id = v_red.id::text
           AND l.amount > 0
      ) INTO v_has_coin_credit;

      -- SSOT-19 F-10: Coin clawback is order-level (reverse_coin_credits_for_order).
      -- Archived Store Cash tables are never written here.
    END IF;
  END LOOP;

  IF v_count = 0 THEN
    RETURN jsonb_build_object('ok', true, 'reversed_count', 0, 'idempotent', true);
  END IF;

  UPDATE public.store_orders so
     SET gift_redemption_amount = coalesce((
       SELECT SUM(r.redeemed_amount)::integer
         FROM public.gift_certificate_redemptions r
        WHERE r.order_id = p_order_id
          AND r.reversed = false
     ), 0)
   WHERE so.id = p_order_id;

  RETURN jsonb_build_object('ok', true, 'reversed_count', v_count, 'order_id', p_order_id);
END;
$function$;

-- Defense in depth: only the two SECURITY DEFINER wrappers (owner postgres) may call it.
REVOKE ALL ON FUNCTION public.gift_certificate_redemption_reverse(uuid) FROM PUBLIC, anon, authenticated, service_role;
