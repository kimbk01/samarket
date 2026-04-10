-- =============================================================================
-- 프로필 위치(회원 카드 / RegionContext / 체크아웃 문자열 보조)
-- -----------------------------------------------------------------------------
-- public.profiles 에만 추가합니다.
-- 생활·거래·배달 기본지는 public.user_addresses (별도 행·플래그)이며,
-- 이 마이그레이션은 user_addresses·stores 를 수정하지 않습니다.
-- 매장 배달/픽업 주소는 매장(stores) 단위 데이터로 회원 프로필과 독립입니다.
-- =============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision,
  ADD COLUMN IF NOT EXISTS full_address text;

COMMENT ON COLUMN public.profiles.latitude IS 'Google Maps 핀 위도 (프로필 위치)';
COMMENT ON COLUMN public.profiles.longitude IS 'Google Maps 핀 경도 (프로필 위치)';
COMMENT ON COLUMN public.profiles.full_address IS '역지오코딩 전체 주소 문자열 (프로필 위치)';
