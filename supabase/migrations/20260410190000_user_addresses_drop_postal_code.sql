-- 통합 주소 원장: ZIP(postal_code) 제거 — 좌표·full_address(지도 Geocoding) 기준으로 전환
ALTER TABLE public.user_addresses DROP COLUMN IF EXISTS postal_code;
