-- Link checkout to saved user_addresses row for ETA/address resync when coords or labels change.
-- Route distance (m) from same Google matrix call as ride minutes.

ALTER TABLE public.store_orders
  ADD COLUMN IF NOT EXISTS delivery_user_address_id uuid;

ALTER TABLE public.store_orders
  ADD COLUMN IF NOT EXISTS checkout_route_distance_meters integer;

COMMENT ON COLUMN public.store_orders.delivery_user_address_id IS
  '배달 체크아웃 시 선택한 user_addresses.id — 주소/좌표 변경 시 주문 ETA·배달지 문구 재계산에 사용';

COMMENT ON COLUMN public.store_orders.checkout_route_distance_meters IS
  '체크아웃 시점 매장→고객 Routes matrix 거리(m) — ride 분과 동일 호출에서 산출';

CREATE INDEX IF NOT EXISTS store_orders_delivery_user_address_id_idx
  ON public.store_orders (delivery_user_address_id)
  WHERE delivery_user_address_id IS NOT NULL;
