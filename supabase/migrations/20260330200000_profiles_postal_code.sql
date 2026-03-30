-- PhilPost ZIP 등 프로필 수정(LocationSelector)과 동기화
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS postal_code text;
