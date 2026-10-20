-- DIBAY 내정보 v2.1 · M2 — 표시 이름(display_name)을 공개 이름(nickname)에 맞춤 (C-11)
--
-- 계약: 회원 공개 이름 SSOT = profiles.nickname (lib/users/public-member-identity.ts).
-- 운영 확인(2026-10-20): nickname ≠ display_name 10행(빈 nickname 0행). display_name 을 nickname 으로 맞춘다.
-- 변경 전 값은 백업 테이블에 보관(관리자 서버만 접근 — RLS 켜고 정책 없음).
-- 롤백: UPDATE public.profiles p SET display_name = b.display_name
--        FROM public.profiles_display_name_backup_m2 b WHERE b.id = p.id;

BEGIN;

CREATE TABLE IF NOT EXISTS public.profiles_display_name_backup_m2 (
  id uuid PRIMARY KEY,
  nickname text,
  display_name text,
  backed_up_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles_display_name_backup_m2 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.profiles_display_name_backup_m2 FROM anon, authenticated;
COMMENT ON TABLE public.profiles_display_name_backup_m2 IS
  'M2 백업 — display_name 을 nickname 으로 맞추기 전 값(롤백용).';

INSERT INTO public.profiles_display_name_backup_m2 (id, nickname, display_name)
SELECT id, nickname, display_name
FROM public.profiles
WHERE coalesce(btrim(nickname), '') <> ''
  AND coalesce(btrim(display_name), '') IS DISTINCT FROM btrim(nickname)
ON CONFLICT (id) DO NOTHING;

UPDATE public.profiles
SET display_name = btrim(nickname)
WHERE coalesce(btrim(nickname), '') <> ''
  AND coalesce(btrim(display_name), '') IS DISTINCT FROM btrim(nickname);

COMMIT;
