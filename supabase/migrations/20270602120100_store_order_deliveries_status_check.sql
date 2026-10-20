-- 배달 오너 G-1 1-F · DLV-02 ① — docs/audit/delivery-owner-2026-10-20/G-1-stage1-2-design.md §4-F
-- 목적: store_order_deliveries.delivery_status 에 6종 값 CHECK (lib/stores/store-order-delivery-status.ts 와 동일 집합).
-- NOT VALID: 기존 행은 검사·변경하지 않고(D-5) 신규 INSERT/UPDATE 만 강제한다.
--   운영 조회(2026-10-21): 2행 모두 'delivered' → VALIDATE 가능하나 이 마이그레이션에서는 실행하지 않는다.
--   Owner 승인 후 별도로 아래 VALIDATE 를 실행한다(위반 행이 있으면 실패만 하고 데이터는 바뀌지 않음):
--   -- ALTER TABLE public.store_order_deliveries VALIDATE CONSTRAINT store_order_deliveries_status_check;
-- 롤백:
--   ALTER TABLE public.store_order_deliveries DROP CONSTRAINT IF EXISTS store_order_deliveries_status_check;

ALTER TABLE public.store_order_deliveries
  DROP CONSTRAINT IF EXISTS store_order_deliveries_status_check;

ALTER TABLE public.store_order_deliveries
  ADD CONSTRAINT store_order_deliveries_status_check
  CHECK (delivery_status IN (
    'waiting_rider', 'rider_assigned', 'pickup_in_progress', 'delivering', 'delivered', 'delivery_failed'
  )) NOT VALID;
