-- 3단계 OPS-08 + LOC-004 격리 DB 추가 픽스처 (운영 분리 로컬 PostgreSQL 16 전용 — 운영/테스트 Supabase 프로젝트에 실행 금지)
-- 전제: store-products-1j/00_fixture.sql + 20270602130000 + stage2-2ef/05_fixture_extra.sql + 20270603150000
--       (= 운영 기준 원문 md5 adc3d68faece57cb3160306f6d5e686e).
-- 컬럼 정의는 운영 information_schema 읽기 전용 조회(2026-10-21)에서 복사:
--   stores.pickup_available boolean NOT NULL DEFAULT true
--   stores.delivery_available boolean NOT NULL DEFAULT false
--   stores.lat / lng double precision NULL
-- store_orders.checkout_store_* / checkout_serviceability_* 는 1-J 픽스처에 이미 있음 (운영과 동일).

ALTER TABLE public.stores
  ADD COLUMN pickup_available boolean NOT NULL DEFAULT true,
  ADD COLUMN delivery_available boolean NOT NULL DEFAULT false,
  ADD COLUMN lat double precision,
  ADD COLUMN lng double precision;

UPDATE public.stores SET lat = 14.5995, lng = 120.9842
 WHERE id = '00000000-0000-0000-0000-0000000000a1';
