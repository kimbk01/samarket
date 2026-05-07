-- Idempotent buyer checkout: same client_order_key + buyer → single store_orders row.
-- Applied 전: 기존 행은 client_order_key NULL 유지.
-- Applied 후: 신규 주문만 선택적으로 키 저장; partial unique 로 NULL 행은 제약 밖.

ALTER TABLE public.store_orders
  ADD COLUMN IF NOT EXISTS client_order_key text;

COMMENT ON COLUMN public.store_orders.client_order_key IS
  '클라이언트 생성 멱등 키(UUID 등). buyer_user_id 와 조합 유일. 재전송·더블탭 시 중복 주문 방지.';

CREATE UNIQUE INDEX IF NOT EXISTS store_orders_buyer_client_order_key_uidx
  ON public.store_orders (buyer_user_id, client_order_key)
  WHERE client_order_key IS NOT NULL AND btrim(client_order_key) <> '';
