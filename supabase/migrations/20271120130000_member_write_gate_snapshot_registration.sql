-- 가입(동의 + 전화 인증 + 대표 주소) 중앙 쓰기 게이트 — 쓰기 검사 스냅샷에 전화·대표 주소 필드 추가 (2026-11-20)
-- 근거: docs/audit/auth-entry-phone-address-consent-design-2026-11-20.md v3 §4-4 · Owner 「승인, 구현 진행」(C-5)
-- 변경: member_write_gate_snapshot 반환 jsonb 에 키 7개 추가만. 기존 키·판정·권한 불변. 표 변경 없음.
--   phone_verified · phone_verified_at · phone_verification_method · provider · auth_provider · email
--     → TS `hasVerifiedPhone` 판정 입력 (관리자 생성 계정 admin_manual·@manual.local 인정 포함)
--   has_default_master → 대표 주소 = active user_addresses AND is_default_master (member_onboarding_facts 와 같은 조건)
-- 롤백: 20271105140000_member_consent_hardening.sql 의 4) 정의로 CREATE OR REPLACE.

BEGIN;

CREATE OR REPLACE FUNCTION public.member_write_gate_snapshot(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT CASE
    WHEN p.id IS NULL THEN jsonb_build_object('found', false)
    ELSE jsonb_build_object(
      'found', true,
      'status', p.status,
      'deleted_at', p.deleted_at,
      'terms_accepted_at', p.terms_accepted_at,
      'terms_version', p.terms_version,
      'privacy_accepted_at', p.privacy_accepted_at,
      'privacy_version', p.privacy_version,
      'date_of_birth', p.date_of_birth,
      'age_gate_status', p.age_gate_status,
      'age_attested_at', p.age_attested_at,
      'age_gate_legacy', EXISTS (
        SELECT 1 FROM public.member_age_gate_legacy_members l WHERE l.user_id = p_user_id
      ),
      'role', p.role,
      'admin_role', (
        SELECT m.role FROM public.admin_memberships m
         WHERE m.user_id = p_user_id AND m.status = 'active'
         LIMIT 1
      ),
      'phone_verified', p.phone_verified,
      'phone_verified_at', p.phone_verified_at,
      'phone_verification_method', p.phone_verification_method,
      'provider', p.provider,
      'auth_provider', p.auth_provider,
      'email', p.email,
      'has_default_master', EXISTS (
        SELECT 1 FROM public.user_addresses a
         WHERE a.user_id = p_user_id AND a.is_active = true AND a.is_default_master = true
      )
    )
  END
  FROM (SELECT 1) AS one
  LEFT JOIN public.profiles p ON p.id = p_user_id;
$$;
REVOKE ALL ON FUNCTION public.member_write_gate_snapshot(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.member_write_gate_snapshot(uuid) TO service_role;

COMMIT;
