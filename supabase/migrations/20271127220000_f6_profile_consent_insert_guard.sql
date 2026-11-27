-- F6 (2026-11-27 · Owner 「승인, 적용 진행」) — 회원이 동의 열을 채운 profiles 행을 직접 넣지 못하게.
-- 설계: docs/audit/f6-profile-consent-insert-guard-design-2026-11-27.md
-- 계약 C4 B6 「동의가 항상 첫 단계」 — 동의는 PATCH /api/me/legal-consent → record_member_required_consent(service_role) 로만 저장.
--
-- 바뀌는 것: guard_profiles_self_insert() 금지 조건에 동의·연령 열 7개 추가. 나머지 본문·트리거 정의·판정 순서는 그대로.
-- service_role·DB 직접 실행은 지금처럼 통과. 앱의 프로필 만들기는 이 열을 넣지 않는다(설계 §2).
--
-- 되돌리기 (적용 전 운영 본문, md5(pg_get_functiondef) = d9e1537e22232d800b85c4811771068f):
-- CREATE OR REPLACE FUNCTION public.guard_profiles_self_insert()
--  RETURNS trigger
--  LANGUAGE plpgsql
--  SET search_path TO 'pg_catalog', 'public'
-- AS $function$
-- DECLARE
--   jwt_claim_role text := nullif(current_setting('request.jwt.claim.role', true), '');
--   request_role text := auth.role();
-- BEGIN
--   IF request_role = 'service_role' OR jwt_claim_role = 'service_role' THEN
--     RETURN NEW;
--   END IF;
--   IF request_role IS NULL AND jwt_claim_role IS NULL THEN
--     RETURN NEW;
--   END IF;
--   IF (NEW.dibay_id IS NOT NULL AND btrim(NEW.dibay_id) <> '')
--     OR (NEW.username IS NOT NULL AND btrim(NEW.username) <> '')
--     OR COALESCE(NEW.username_confirmed, false)
--     OR COALESCE(NEW.dibay_id_locked, false)
--     OR COALESCE(NEW.dibay_id_auto_assigned, false)
--     OR COALESCE(NEW.dibay_id_changed_once, false)
--     OR NEW.dibay_id_initial IS NOT NULL
--     OR NEW.dibay_id_changed_at IS NOT NULL
--     OR COALESCE(NEW.is_admin, false)
--     OR NEW.admin_tier IS NOT NULL
--     OR NEW.deleted_at IS NOT NULL
--     OR COALESCE(NEW.points, 0) <> 0
--     OR COALESCE(NEW.phone_verified, false)
--     OR NEW.phone_verified_at IS NOT NULL
--     OR COALESCE(NEW.realname_verified, false)
--     OR NEW.verified_member_at IS NOT NULL
--     OR COALESCE(NEW.role, 'user') <> 'user'
--     OR COALESCE(NEW.member_type, 'normal') <> 'normal' THEN
--     RAISE EXCEPTION 'profiles_identity_field_insert_forbidden'
--       USING ERRCODE = '42501';
--   END IF;
--   RETURN NEW;
-- END;
-- $function$;

CREATE OR REPLACE FUNCTION public.guard_profiles_self_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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
  IF (NEW.dibay_id IS NOT NULL AND btrim(NEW.dibay_id) <> '')
    OR (NEW.username IS NOT NULL AND btrim(NEW.username) <> '')
    OR COALESCE(NEW.username_confirmed, false)
    OR COALESCE(NEW.dibay_id_locked, false)
    OR COALESCE(NEW.dibay_id_auto_assigned, false)
    OR COALESCE(NEW.dibay_id_changed_once, false)
    OR NEW.dibay_id_initial IS NOT NULL
    OR NEW.dibay_id_changed_at IS NOT NULL
    OR COALESCE(NEW.is_admin, false)
    OR NEW.admin_tier IS NOT NULL
    OR NEW.deleted_at IS NOT NULL
    OR COALESCE(NEW.points, 0) <> 0
    OR COALESCE(NEW.phone_verified, false)
    OR NEW.phone_verified_at IS NOT NULL
    OR COALESCE(NEW.realname_verified, false)
    OR NEW.verified_member_at IS NOT NULL
    OR COALESCE(NEW.role, 'user') <> 'user'
    OR COALESCE(NEW.member_type, 'normal') <> 'normal' THEN
    RAISE EXCEPTION 'profiles_identity_field_insert_forbidden'
      USING ERRCODE = '42501';
  END IF;
  -- F6: 약관·개인정보·연령 동의 열은 서버 동의 저장(service_role)만 쓴다 — 회원 직접 INSERT 금지
  IF NEW.terms_accepted_at IS NOT NULL
    OR NEW.terms_version IS NOT NULL
    OR NEW.privacy_accepted_at IS NOT NULL
    OR NEW.privacy_version IS NOT NULL
    OR NEW.date_of_birth IS NOT NULL
    OR NEW.age_gate_status IS NOT NULL
    OR NEW.age_attested_at IS NOT NULL THEN
    RAISE EXCEPTION 'profiles_consent_field_insert_forbidden'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;
