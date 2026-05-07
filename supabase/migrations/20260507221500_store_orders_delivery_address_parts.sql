-- Store order delivery address normalization (PH)
-- - 지역(region/city)은 향후 배송권역/운영 필터의 기준 키로 사용
-- - 주소는 summary(주소1) + detail(세부주소)로 유지, 전체 주소는 표시에서 조합

ALTER TABLE public.store_orders
  ADD COLUMN IF NOT EXISTS delivery_region text;

ALTER TABLE public.store_orders
  ADD COLUMN IF NOT EXISTS delivery_city text;

COMMENT ON COLUMN public.store_orders.delivery_region IS '배달/배송 지역(상위). PH 기준: Manila 등';
COMMENT ON COLUMN public.store_orders.delivery_city IS '배달/배송 지역(하위). PH 기준: Quiapo 등';

CREATE INDEX IF NOT EXISTS store_orders_delivery_region_city_idx
  ON public.store_orders (delivery_region, delivery_city, created_at desc);

