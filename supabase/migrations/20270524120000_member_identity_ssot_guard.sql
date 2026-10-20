-- DIBAY 회원 ID·프로필 SSOT — 감사 #5 · #6
--
-- #6 (보안) 회원 JWT 로 PostgREST 를 직접 호출하면 profiles 의 공개 아이디·1회 변경 플래그 등을
--    UPDATE 할 수 있었다 (authenticated 컬럼 UPDATE grant 전체 + RLS 본인 행 허용 + 가드 트리거 미포함).
--    → 아이디 1회 변경 제한 우회, 자동 아이디 패턴(dibay_[hex6]) 선점 가능.
--    조치: (a) 식별·권한 컬럼 UPDATE grant 를 authenticated/anon 에서 회수
--          (b) guard_profiles_self_update 에 같은 컬럼 보호 추가 (관리자 JWT 포함 — 서버 전용 경로만 허용)
--          (c) INSERT 가드 — 회원 JWT 로 식별·권한 컬럼을 채운 행을 만들 수 없다
--    정상 쓰기 경로(조사 결과): 모두 service_role —
--      assign_auto_dibay_id / confirm_dibay_id (service_role 전용 RPC), /api/me/dibay-id/*,
--      /api/admin/users/* (service_role), 가입 ensure*ProfileRow (service_role 우선),
--      /api/me/leave-request (service_role). RLS 는 변경하지 않는다.
--
-- #5 관리자 아이디 변경 — admin_set_dibay_id: dibay_id·username 을 한 트랜잭션에서 갱신하고
--    변경 사유·실행자·전후 값을 같은 트랜잭션에서 audit_logs 에 기록한다.
--    회원 본인 1회 변경권(dibay_id_auto_assigned / dibay_id_changed_once / dibay_id_changed_at / dibay_id_locked)은
--    읽지도 바꾸지도 않는다 → 관리자 변경은 회원 변경 횟수에 영향 없음.

BEGIN;

-- ---------------------------------------------------------------------------
-- (a) 컬럼 UPDATE grant 회수
-- ---------------------------------------------------------------------------
REVOKE UPDATE (
  dibay_id,
  dibay_id_locked,
  dibay_id_auto_assigned,
  dibay_id_initial,
  dibay_id_changed_once,
  dibay_id_changed_at,
  username,
  username_confirmed,
  username_set_at,
  is_admin,
  admin_tier,
  deleted_at,
  member_status,
  verified_member_at,
  realname,
  realname_verified,
  trust_score,
  manner_score,
  manner_temperature,
  auth_login_email,
  provider_user_id,
  manual_account_type,
  created_at
) ON TABLE public.profiles FROM authenticated, anon;

-- ---------------------------------------------------------------------------
-- (b) UPDATE 가드 — 기존 F-07·restricted 검사 유지 + 식별 컬럼 보호
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_profiles_self_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor uuid := auth.uid();
  jwt_claim_role text := nullif(current_setting('request.jwt.claim.role', true), '');
  request_role text := auth.role();
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  -- Canonical service writers: PostgREST service_role (auth.role) and/or jwt claim.
  IF request_role = 'service_role' OR jwt_claim_role = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- F-07: points is never member/admin-JWT writable.
  IF NEW.points IS DISTINCT FROM OLD.points THEN
    RAISE EXCEPTION 'profiles_points_direct_update_forbidden'
      USING ERRCODE = '42501';
  END IF;

  -- 식별·권한 컬럼 — 회원·관리자 JWT 모두 직접 변경 금지 (서버 전용 RPC/API 만).
  -- JWT 없는 세션(마이그레이션·DB 콘솔)은 request_role 이 NULL 이므로 대상 아님.
  IF request_role IS NOT NULL OR jwt_claim_role IS NOT NULL THEN
    IF NEW.dibay_id IS DISTINCT FROM OLD.dibay_id
      OR NEW.dibay_id_locked IS DISTINCT FROM OLD.dibay_id_locked
      OR NEW.dibay_id_auto_assigned IS DISTINCT FROM OLD.dibay_id_auto_assigned
      OR NEW.dibay_id_initial IS DISTINCT FROM OLD.dibay_id_initial
      OR NEW.dibay_id_changed_once IS DISTINCT FROM OLD.dibay_id_changed_once
      OR NEW.dibay_id_changed_at IS DISTINCT FROM OLD.dibay_id_changed_at
      OR NEW.username IS DISTINCT FROM OLD.username
      OR NEW.username_confirmed IS DISTINCT FROM OLD.username_confirmed
      OR NEW.username_set_at IS DISTINCT FROM OLD.username_set_at
      OR NEW.is_admin IS DISTINCT FROM OLD.is_admin
      OR NEW.admin_tier IS DISTINCT FROM OLD.admin_tier
      OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
      OR NEW.member_status IS DISTINCT FROM OLD.member_status
      OR NEW.verified_member_at IS DISTINCT FROM OLD.verified_member_at
      OR NEW.realname IS DISTINCT FROM OLD.realname
      OR NEW.realname_verified IS DISTINCT FROM OLD.realname_verified
      OR NEW.trust_score IS DISTINCT FROM OLD.trust_score
      OR NEW.manner_score IS DISTINCT FROM OLD.manner_score
      OR NEW.manner_temperature IS DISTINCT FROM OLD.manner_temperature
      OR NEW.auth_login_email IS DISTINCT FROM OLD.auth_login_email
      OR NEW.provider_user_id IS DISTINCT FROM OLD.provider_user_id
      OR NEW.manual_account_type IS DISTINCT FROM OLD.manual_account_type
      OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'profiles_identity_field_update_forbidden'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF actor IS NULL OR actor <> OLD.id OR public.is_platform_admin(actor) THEN
    RETURN NEW;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role
    OR NEW.status IS DISTINCT FROM OLD.status
    OR NEW.provider IS DISTINCT FROM OLD.provider
    OR NEW.auth_provider IS DISTINCT FROM OLD.auth_provider
    OR NEW.phone_verified IS DISTINCT FROM OLD.phone_verified
    OR NEW.phone_verification_status IS DISTINCT FROM OLD.phone_verification_status
    OR NEW.phone_verified_at IS DISTINCT FROM OLD.phone_verified_at
    OR NEW.phone_country_code IS DISTINCT FROM OLD.phone_country_code
    OR NEW.phone_number IS DISTINCT FROM OLD.phone_number
    OR NEW.active_session_id IS DISTINCT FROM OLD.active_session_id
    OR NEW.last_login_at IS DISTINCT FROM OLD.last_login_at
    OR NEW.created_by_admin IS DISTINCT FROM OLD.created_by_admin
    OR NEW.member_type IS DISTINCT FROM OLD.member_type
    OR NEW.is_special_member IS DISTINCT FROM OLD.is_special_member THEN
    RAISE EXCEPTION 'profiles_restricted_field_update';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.guard_profiles_self_update() IS
  'F-07 points lock + member restricted fields + identity/privilege columns (dibay_id*, username*, admin flags, deleted_at, member_status, trust) — service_role or JWT-less sessions only.';

-- ---------------------------------------------------------------------------
-- (c) INSERT 가드 — 회원 JWT 로 식별·권한 값을 채운 행 생성 금지
--     (가입 행 생성은 service_role. route-client 폴백 행은 아래 기본값만 사용)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_profiles_self_insert()
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
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_guard_self_insert ON public.profiles;
CREATE TRIGGER trg_profiles_guard_self_insert
  BEFORE INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_profiles_self_insert();

-- ---------------------------------------------------------------------------
-- #5 관리자 공개 아이디 변경 RPC
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_set_dibay_id(
  p_target_user_id uuid,
  p_dibay_id text,
  p_actor_user_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_normalized text;
  v_row public.profiles%ROWTYPE;
  v_before text;
  v_now timestamptz := now();
  v_reason text := nullif(btrim(COALESCE(p_reason, '')), '');
BEGIN
  IF COALESCE((SELECT auth.role()), '') <> 'service_role'
     AND session_user NOT IN ('postgres', 'supabase_admin') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_target_user_id IS NULL OR p_actor_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'user_id_required');
  END IF;

  v_normalized := lower(btrim(replace(COALESCE(p_dibay_id, ''), '@', '')));
  IF v_normalized = '' THEN
    -- 비우면 친구 검색·표시가 끊긴다 — 관리자도 공개 아이디를 삭제할 수 없다.
    RETURN jsonb_build_object('ok', false, 'error', 'dibay_id_required');
  END IF;
  IF v_normalized !~ '^[a-z0-9](?:[a-z0-9_.]{2,18}[a-z0-9])$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'dibay_id_invalid_format');
  END IF;
  IF v_normalized IN (
    'admin', 'administrator', 'support', 'owner', 'system', 'official',
    'staff', 'root', 'mod', 'help', 'dibay', 'samarket'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'dibay_id_reserved');
  END IF;
  IF v_normalized ~ '^dibay_[a-f0-9]{6}$' THEN
    -- 자동 발급 패턴은 시스템 전용 (과거 자동 아이디 재사용·사칭 방지)
    RETURN jsonb_build_object('ok', false, 'error', 'dibay_id_reserved_pattern');
  END IF;

  SELECT * INTO v_row FROM public.profiles WHERE id = p_target_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'profile_missing');
  END IF;

  v_before := nullif(lower(btrim(COALESCE(v_row.dibay_id, ''))), '');
  IF v_before = v_normalized AND lower(btrim(COALESCE(v_row.username, ''))) = v_normalized THEN
    RETURN jsonb_build_object('ok', true, 'dibay_id', v_normalized, 'idempotent', true);
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id <> p_target_user_id
      AND (
        lower(btrim(p.dibay_id)) = v_normalized
        OR (lower(btrim(p.username)) = v_normalized AND p.username_confirmed = true)
      )
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'dibay_id_taken');
  END IF;

  UPDATE public.profiles
  SET
    dibay_id = v_normalized,
    username = v_normalized,
    username_confirmed = true,
    username_set_at = COALESCE(username_set_at, v_now),
    updated_at = v_now
  WHERE id = p_target_user_id;

  INSERT INTO public.audit_logs (actor_type, actor_id, target_type, target_id, action, before_json, after_json)
  VALUES (
    'admin',
    p_actor_user_id,
    'member',
    p_target_user_id::text,
    'admin_member_dibay_id_change',
    jsonb_build_object('dibay_id', v_before, 'username', v_row.username),
    jsonb_build_object(
      'before', v_before,
      'after', v_normalized,
      'reason', v_reason,
      'member_change_right_used', COALESCE(v_row.dibay_id_changed_once, false),
      'via', 'admin_set_dibay_id'
    )
  );

  RETURN jsonb_build_object('ok', true, 'dibay_id', v_normalized, 'before', v_before);
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'dibay_id_taken');
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_dibay_id(uuid, text, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_set_dibay_id(uuid, text, uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_dibay_id(uuid, text, uuid, text) TO service_role;

COMMENT ON FUNCTION public.admin_set_dibay_id(uuid, text, uuid, text) IS
  '관리자 공개 아이디 변경 — dibay_id·username 동시 갱신 + audit_logs 동일 트랜잭션. 회원 1회 변경권 컬럼 불변.';

COMMIT;
