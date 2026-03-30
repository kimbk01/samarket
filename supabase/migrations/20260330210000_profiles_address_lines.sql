-- 프로필 수정: 매장과 동일 지번·건물·번지 / 동·호·출입
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS address_street_line text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS address_detail text;
