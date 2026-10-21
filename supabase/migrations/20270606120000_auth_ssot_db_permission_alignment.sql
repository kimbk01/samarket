-- DIBAY AUTH 통합 SSOT — 묶음 3 (DB 권한 정합)
-- 근거: docs/dibay-auth-full-audit-ssot-design-2026-10-21.md §3 P1-10 · P1-12 · P1-13 · P2-8 · P2-16 · P2-17 (Owner 승인 2026-10-21)
-- 회원 데이터 변경 없음. 권한·정책·함수 본문만 바꾼다.
-- 운영 적용 2026-10-21 (PHT): 같은 내용을 6개 단위로 적용 — auth_ssot_provider_secret_configured_column ·
--   auth_ssot_revoke_member_direct_writes · auth_ssot_profiles_self_update_guard_phone_consent ·
--   auth_ssot_admin_sql_role_to_membership · auth_ssot_provider_secret_vault · auth_ssot_favorite_audit_log_private

-- ─────────────────────────────────────────────────────────────────────────────
-- P1-10 · P2-8: API(서비스 롤)로만 쓰는 테이블 — 회원 JWT 직접 쓰기 차단
--   중앙 API 게이트(동의·생애주기)를 PostgREST 직접 호출로 우회하던 경로를 닫는다.
--   SELECT 권한·정책은 그대로 둔다(읽기 화면 영향 없음).
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'comments',
    'post_comments',
    'price_offers',
    'favorites',
    'community_friend_requests',
    'product_chats',
    'product_chat_messages',
    'transaction_reviews',
    'chat_rooms',
    'reports',
    'user_blocks',
    'community_post_likes',
    'meeting_members',
    'store_orders',
    'store_order_items',
    'store_payments'
  ]
  LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.%I FROM anon, authenticated', t);
    END IF;
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- P2-17: favorite_audit_log — 누가 무엇을 찜했는지 공개 읽기 차단 (관리자 API 는 서비스 롤)
-- ─────────────────────────────────────────────────────────────────────────────
REVOKE SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON public.favorite_audit_log FROM anon, authenticated;
ALTER POLICY favorite_audit_log_select ON public.favorite_audit_log TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- P1-12: profiles 자기 수정 가드 — phone · 약관/개인정보 동의 기록 추가
--   phone 은 OTP verify(서비스 롤)만, terms_/privacy_* 는 PATCH /api/me/legal-consent(서비스 롤)만 쓴다.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.guard_profiles_self_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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
    OR NEW.phone IS DISTINCT FROM OLD.phone
    OR NEW.phone_verified IS DISTINCT FROM OLD.phone_verified
    OR NEW.phone_verification_status IS DISTINCT FROM OLD.phone_verification_status
    OR NEW.phone_verified_at IS DISTINCT FROM OLD.phone_verified_at
    OR NEW.phone_country_code IS DISTINCT FROM OLD.phone_country_code
    OR NEW.phone_number IS DISTINCT FROM OLD.phone_number
    OR NEW.terms_accepted_at IS DISTINCT FROM OLD.terms_accepted_at
    OR NEW.terms_version IS DISTINCT FROM OLD.terms_version
    OR NEW.privacy_accepted_at IS DISTINCT FROM OLD.privacy_accepted_at
    OR NEW.privacy_version IS DISTINCT FROM OLD.privacy_version
    OR NEW.active_session_id IS DISTINCT FROM OLD.active_session_id
    OR NEW.last_login_at IS DISTINCT FROM OLD.last_login_at
    OR NEW.created_by_admin IS DISTINCT FROM OLD.created_by_admin
    OR NEW.member_type IS DISTINCT FROM OLD.member_type
    OR NEW.is_special_member IS DISTINCT FROM OLD.is_special_member THEN
    RAISE EXCEPTION 'profiles_restricted_field_update';
  END IF;

  RETURN NEW;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- P1-13: 관리자 판정 잔존 profiles.role → admin_memberships (관리자 권한 SSOT)
--   운영 본문을 그대로 두고 판정식만 치환한다. 치환 대상이 없으면 실패(조용한 무변경 금지).
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  fn regprocedure;
  def text;
  patched text;
  membership_expr constant text :=
    'EXISTS (SELECT 1 FROM public.admin_memberships am WHERE am.user_id = p.id AND am.status = ''active'' AND am.role IN (''admin'', ''super_admin''))';
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.admin_delivery_operation_recovery_execute(text,uuid)'::regprocedure,
    'public.approve_delivery_alert_auto_action(uuid,uuid,text)'::regprocedure,
    'public.retry_delivery_alert_auto_action(uuid,uuid)'::regprocedure,
    'public.run_delivery_operation_alert_auto_actions()'::regprocedure
  ]
  LOOP
    def := pg_get_functiondef(fn);
    patched := regexp_replace(def, 'p\.role\s+in\s*\(\s*''admin''\s*,\s*''super_admin''\s*\)', membership_expr, 'gi');
    IF patched = def THEN
      RAISE EXCEPTION 'auth_ssot_role_pattern_not_found: %', fn;
    END IF;
    EXECUTE patched;
  END LOOP;

  def := pg_get_functiondef('public.admin_dashboard_aggregate_json(timestamp with time zone)'::regprocedure);
  patched := regexp_replace(
    def,
    'FROM\s+public\.profiles\s+WHERE\s+role\s+IN\s*\(\s*''admin''\s*,\s*''master''\s*\)',
    'FROM public.admin_memberships WHERE status = ''active''',
    'gi'
  );
  IF patched = def THEN
    RAISE EXCEPTION 'auth_ssot_role_pattern_not_found: admin_dashboard_aggregate_json';
  END IF;
  EXECUTE patched;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- P2-16: auth_providers.client_secret 평문 보관 → Supabase Vault
--   테이블에는 비밀이 아닌 참조값(vault:<name>)만 남긴다. 화면 노출 여부는 client_secret_configured.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.auth_providers
  ADD COLUMN IF NOT EXISTS client_secret_configured boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.admin_set_auth_provider_secret(p_provider text, p_secret text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_name text := 'auth_provider_client_secret:' || p_provider;
  v_secret text := btrim(coalesce(p_secret, ''));
  v_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.auth_providers WHERE provider = p_provider) THEN
    RAISE EXCEPTION 'auth_provider_not_found';
  END IF;

  SELECT s.id INTO v_id FROM vault.secrets s WHERE s.name = v_name;

  IF v_secret = '' THEN
    IF v_id IS NOT NULL THEN
      DELETE FROM vault.secrets WHERE id = v_id;
    END IF;
    UPDATE public.auth_providers
       SET client_secret = '', client_secret_configured = false, updated_at = now()
     WHERE provider = p_provider;
    RETURN;
  END IF;

  IF v_id IS NULL THEN
    PERFORM vault.create_secret(v_secret, v_name, 'DIBAY auth provider client secret');
  ELSE
    PERFORM vault.update_secret(v_id, v_secret);
  END IF;

  UPDATE public.auth_providers
     SET client_secret = 'vault:' || v_name, client_secret_configured = true, updated_at = now()
   WHERE provider = p_provider;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_set_auth_provider_secret(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_auth_provider_secret(text, text) TO service_role;

-- 기존 평문 값 이전 (값을 SQL 본문에 쓰지 않고 테이블에서 직접 옮긴다)
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT provider, client_secret
      FROM public.auth_providers
     WHERE btrim(client_secret) <> ''
       AND client_secret NOT LIKE 'vault:%'
  LOOP
    PERFORM public.admin_set_auth_provider_secret(r.provider, r.client_secret);
  END LOOP;

  UPDATE public.auth_providers
     SET client_secret_configured = (client_secret LIKE 'vault:%')
   WHERE client_secret_configured IS DISTINCT FROM (client_secret LIKE 'vault:%');
END $$;
