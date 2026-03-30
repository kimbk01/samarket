-- 프로필 위치·주소 (Supabase Dashboard → SQL Editor 에 붙여넣기 후 Run)
-- 미실행 시 오류 예: Could not find the 'address_detail' column of 'profiles' in the schema cache
-- = supabase/migrations/20260330200000_profiles_postal_code.sql
--   + 20260330210000_profiles_address_lines.sql

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS postal_code text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS address_street_line text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS address_detail text;
