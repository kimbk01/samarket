-- 주문 시점 조리·라이딩 ETA 스냅샷 (Google Routes 기반 배달 구간)
ALTER TABLE public.store_orders
  ADD COLUMN IF NOT EXISTS checkout_prep_minutes integer;

ALTER TABLE public.store_orders
  ADD COLUMN IF NOT EXISTS checkout_ride_minutes integer;

ALTER TABLE public.store_orders
  ADD COLUMN IF NOT EXISTS checkout_eta_minutes integer;

ALTER TABLE public.store_orders
  ADD COLUMN IF NOT EXISTS checkout_eta_computed_at timestamptz;

COMMENT ON COLUMN public.store_orders.checkout_prep_minutes IS '주문 시점 예상 조리(분) — stores.business_hours_json.prep_time_minutes 기반';
COMMENT ON COLUMN public.store_orders.checkout_ride_minutes IS '주문 시점 매장→고객 라이딩 추정(분) — Routes API';
COMMENT ON COLUMN public.store_orders.checkout_eta_minutes IS 'checkout_prep + checkout_ride 합(분), 라이딩 미산출 시 null';
COMMENT ON COLUMN public.store_orders.checkout_eta_computed_at IS 'ETA 스냅샷 계산 시각(서버)';
