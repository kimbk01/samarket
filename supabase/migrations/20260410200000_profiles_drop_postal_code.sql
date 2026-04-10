-- 프로필: PhilPost ZIP 제거 — 지역(region)·상세 주소만 유지 (통합 주소는 user_addresses + 지도)
ALTER TABLE public.profiles DROP COLUMN IF EXISTS postal_code;
