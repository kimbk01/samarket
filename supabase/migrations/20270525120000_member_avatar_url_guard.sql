-- DIBAY 내정보 v2.1 PR-1 · D1 — 회원 프로필 사진 주소 DB 가드 (M1a)
--
-- 문제: 회원 JWT 는 profiles.avatar_url 을 직접 UPDATE 할 수 있다
--       (계약 20270118150000 F07 "회원 프로필 직접 수정 보존" — 이 권한은 유지한다).
--       값 검사가 없어 다른 회원의 게시글·프로필 사진 주소나 임의 외부 주소를 내 사진으로 지정할 수 있었고,
--       사진 교체 시 서버가 "이전 사진"을 service_role 로 삭제하면서 다른 회원 파일이 지워질 수 있었다.
-- 조치: 권한 회수 대신 값 검사. 회원(또는 관리자) JWT 가 avatar_url 을 바꿀 때만 아래 값을 허용한다.
--       - NULL
--       - 기본 그림 '/samarket-default-avatar.svg'
--       - 본인 프로필 폴더 원본
--         https://ckdosyydvgzqwpbwuhon.supabase.co/storage/v1/object/public/post-images/<행 소유자 uid>/profile/<uuid>.(jpg|jpeg|png|webp)
--       값이 바뀌지 않으면 검사하지 않는다 → 기존 구글·카카오 사진 보존.
--       JWT user_metadata 의 소셜 사진은 신뢰하지 않는다(회원이 auth.updateUser 로 바꿀 수 있음).
--       회원 JWT INSERT(서비스 롤이 없을 때의 가입 폴백)에서 허용 밖 값이면 예외 대신 NULL 로 저장 → 가입은 막지 않는다.
--       service_role·JWT 없는 세션(마이그레이션·콘솔)은 대상 아님 → 가입 시 소셜 사진 저장·관리자 서버 조치 유지.
-- API 규칙 SSOT: lib/profile/member-avatar-url-policy.ts (같은 규칙).
-- 저장소: post-images 는 회원 본인 폴더 INSERT 정책만 있고 DELETE/UPDATE 정책이 없다 → 회원 직접 삭제 불가(변경 없음).

BEGIN;

CREATE OR REPLACE FUNCTION public.is_allowed_member_avatar_url(
  p_owner uuid,
  p_url text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
  SELECT
    p_url IS NULL
    OR p_url = '/samarket-default-avatar.svg'
    OR (
      p_owner IS NOT NULL
      AND p_url ~ (
        '^https://ckdosyydvgzqwpbwuhon\.supabase\.co/storage/v1/object/public/post-images/'
        || lower(p_owner::text)
        || '/profile/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$'
      )
    );
$$;

COMMENT ON FUNCTION public.is_allowed_member_avatar_url(uuid, text) IS
  'D1 회원 프로필 사진 허용 규칙 — NULL·기본 그림·본인 profile 폴더 원본. API lib/profile/member-avatar-url-policy.ts 와 동일.';

CREATE OR REPLACE FUNCTION public.guard_profiles_member_avatar()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  jwt_claim_role text := nullif(current_setting('request.jwt.claim.role', true), '');
  request_role text := auth.role();
BEGIN
  IF request_role = 'service_role' OR jwt_claim_role = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF request_role IS NULL AND jwt_claim_role IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.avatar_url IS NOT DISTINCT FROM OLD.avatar_url THEN
    RETURN NEW;
  END IF;

  IF public.is_allowed_member_avatar_url(NEW.id, NEW.avatar_url) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.avatar_url := NULL;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'profiles_avatar_url_not_allowed'
    USING ERRCODE = '42501';
END;
$$;

COMMENT ON FUNCTION public.guard_profiles_member_avatar() IS
  'D1 — 회원·관리자 JWT 의 avatar_url 변경을 is_allowed_member_avatar_url 로 검사(UPDATE 위반=예외, INSERT 위반=NULL). service_role·JWT 없는 세션 제외, 값 불변 시 제외.';

DROP TRIGGER IF EXISTS trg_profiles_guard_member_avatar ON public.profiles;
CREATE TRIGGER trg_profiles_guard_member_avatar
  BEFORE INSERT OR UPDATE OF avatar_url ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_profiles_member_avatar();

REVOKE ALL ON FUNCTION public.guard_profiles_member_avatar() FROM PUBLIC;

COMMIT;
