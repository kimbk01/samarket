-- DIBAY 내정보 v2.1 · M1b — 닉네임 길이 검사 + display_name 자동 동기 (C-11 · D14)
--
-- - 닉네임이 바뀌면(INSERT 포함) display_name 을 같은 값으로 맞춘다 → 두 컬럼이 다시 갈라지지 않음(M2 정렬 유지)
-- - 회원·관리자 JWT 로 닉네임을 바꿀 때 2~20자 검사(API /api/me/profile 과 같은 규칙) — 직접 UPDATE 우회 차단
--   service_role·JWT 없는 세션(서버 API·마이그레이션)은 API 가 검사하므로 제외.
--   설계의 테이블 CHECK 대신 트리거로 둔 이유: 운영에 39자 시스템 내부 계정(__community_import_principal_internal__) 1행이 있어
--   CHECK 는 VALIDATE 불가이고, NOT VALID CHECK 도 그 행의 다른 컬럼 수정까지 막는다.
-- 기존 행 변경 0건. 롤백: DROP TRIGGER trg_profiles_nickname_display_sync ON public.profiles;
--   DROP FUNCTION public.profiles_nickname_display_sync();

BEGIN;

CREATE OR REPLACE FUNCTION public.profiles_nickname_display_sync()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  jwt_claim_role text := nullif(current_setting('request.jwt.claim.role', true), '');
  request_role text := auth.role();
  v_nick text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.nickname IS NOT DISTINCT FROM OLD.nickname THEN
    RETURN NEW;
  END IF;

  v_nick := btrim(coalesce(NEW.nickname, ''));

  IF coalesce(request_role, jwt_claim_role) IS NOT NULL
     AND request_role IS DISTINCT FROM 'service_role'
     AND jwt_claim_role IS DISTINCT FROM 'service_role'
     AND NEW.nickname IS NOT NULL
     AND char_length(v_nick) NOT BETWEEN 2 AND 20 THEN
    RAISE EXCEPTION 'profiles_nickname_length_invalid'
      USING ERRCODE = '23514';
  END IF;

  IF v_nick <> '' THEN
    NEW.display_name := v_nick;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.profiles_nickname_display_sync() IS
  'M1b — 닉네임 변경 시 display_name 동기 + 회원·관리자 JWT 닉네임 2~20자 검사.';

REVOKE ALL ON FUNCTION public.profiles_nickname_display_sync() FROM PUBLIC;

CREATE OR REPLACE TRIGGER trg_profiles_nickname_display_sync
  BEFORE INSERT OR UPDATE OF nickname ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.profiles_nickname_display_sync();

COMMIT;
