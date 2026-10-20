-- 배달 오너 감사 P0-5 (Owner 승인 D-1, 2026-10-20) — docs/audit/delivery-owner-2026-10-20/D-defects-register.md
-- 증상: 운영 trg_store_orders_commission_lifecycle 가 비활성(tgenabled='D') → 조리 진입 수수료 미부과,
--       조리 이후 취소·환불의 수수료 검토 대기 미생성. 저장소에 비활성화 코드 없음(운영 수동 비활성 추정).
-- 결정: 수수료율·부과 시점(조리 이후 상태 첫 진입, 같은 트랜잭션)은 기존 정책(20270510120000) 그대로.
--       과거 주문 소급 부과 금지 → 재활성 시각 이전에 생성된 주문은 다음 상태 변경에서도 부과하지 않는다
--       (재활성 시점 미종료 주문 139건, 마지막 주문 2026-09-24). 이미 부과된 주문의 취소·환불 검토 분기는 그대로.
-- 롤백:
--   ALTER TABLE public.store_orders DISABLE TRIGGER trg_store_orders_commission_lifecycle;
--   (함수 본문은 20270510120000 의 정의로 되돌림)

-- c_charge_from: 재활성 기준 시각 — 이 시각 이전 생성 주문은 소급 부과하지 않는다 (Owner D-1).
-- (함수 본문에는 비 ASCII 주석을 넣지 않는다)
CREATE OR REPLACE FUNCTION public.store_orders_commission_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_res jsonb;
  v_flagged uuid;
  c_charge_from constant timestamptz := '2026-10-20 20:30:00+00';
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.order_status IS NOT DISTINCT FROM OLD.order_status THEN
    RETURN NULL;
  END IF;

  IF NEW.order_status IN ('preparing', 'ready_for_pickup', 'delivering', 'arrived', 'completed') THEN
    IF NEW.created_at < c_charge_from THEN
      RETURN NULL;
    END IF;
    v_res := public.store_commission_charge_order_internal(NEW.id, NEW.order_status);
    IF coalesce(v_res->>'ok', 'false') IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION 'store_commission_charge_failed:%', coalesce(v_res->>'error', 'unknown')
        USING ERRCODE = 'P0001';
    END IF;
  ELSIF NEW.order_status IN ('cancelled', 'refunded') THEN
    UPDATE public.store_sale_fee_obligations
       SET adjustment_status = 'review_required',
           adjustment_trigger = NEW.order_status,
           review_flagged_at = now()
     WHERE order_id = NEW.id
       AND adjustment_status = 'none'
       AND status <> 'waived'
       AND fee_due_minor > 0
    RETURNING id INTO v_flagged;
    IF v_flagged IS NOT NULL THEN
      PERFORM public.store_commission_notify_review(v_flagged);
    END IF;
  END IF;
  RETURN NULL;
END;
$fn$;

REVOKE ALL ON FUNCTION public.store_orders_commission_lifecycle() FROM PUBLIC, anon, authenticated, service_role;

ALTER TABLE public.store_orders ENABLE TRIGGER trg_store_orders_commission_lifecycle;
