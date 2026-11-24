-- 회원 가입 SSOT (2026-11-24 · Owner 「설계대로 진행」 · docs/audit/registration-ssot-redesign-2026-11-24.md S2·S4)
-- 변경 (반환 jsonb 에 키 추가만 — 기존 키·판정·권한·표 불변):
--   1) member_onboarding_facts.profile 에 phone            → 수동 회원(admin_manual)은 번호가 있을 때만 전화 인증 (S4)
--   2) member_write_gate_snapshot 에 phone                  → 중앙 쓰기 게이트도 같은 판정
--   3) custom_access_token_hook 클레임 dibay_m 에 가입 재료 → proxy 가입 관문(S2): 「완료」면 DB 생략
--      reg = 1 (재료 있음 표지) · phone_verified · phone_verified_at · phone_verification_method · provider · auth_provider
--      · email · role · has_phone(번호 자체는 넣지 않음) · has_default_master · admin_role(활성 관리자 멤버십 역할 — 관리자 면제)
-- 순서: 이 마이그레이션을 먼저 적용해도 기존 코드는 새 키를 읽지 않는다(안전). 코드 반영은 적용 뒤.
-- 롤백: 20271101030000_member_onboarding_facts.sql · 20271120130000_member_write_gate_snapshot_registration.sql ·
--       20271119210000_custom_access_token_hook_member_claims.sql 의 정의로 CREATE OR REPLACE.

BEGIN;

CREATE OR REPLACE FUNCTION public.member_onboarding_facts(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  select jsonb_build_object(
    'profile', (
      select to_jsonb(p) from (
        select pr.id, pr.username, pr.username_confirmed, pr.dibay_id, pr.dibay_id_locked, pr.display_name,
               pr.avatar_url, pr.nickname, pr.email, pr.role, pr.phone_verified, pr.phone_verified_at,
               pr.phone_verification_method, pr.provider, pr.auth_provider, pr.terms_accepted_at, pr.terms_version,
               pr.privacy_accepted_at, pr.privacy_version, pr.onboarding_completed_at, pr.onboarding_status,
               pr.phone
          from public.profiles pr
         where pr.id = p_user_id
      ) p
    ),
    'has_default_address', exists (
      select 1 from public.user_addresses a
       where a.user_id = p_user_id and a.is_active = true and a.is_default_master = true
    ),
    'admin_role', (
      select m.role from public.admin_memberships m
       where m.user_id = p_user_id and m.status = 'active'
       limit 1
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.member_write_gate_snapshot(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
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
      'phone', p.phone,
      'has_default_master', EXISTS (
        SELECT 1 FROM public.user_addresses a
         WHERE a.user_id = p_user_id AND a.is_active = true AND a.is_default_master = true
      )
    )
  END
  FROM (SELECT 1) AS one
  LEFT JOIN public.profiles p ON p.id = p_user_id;
$$;

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_claims jsonb;
  v_uid uuid;
  v_row record;
  v_has_default_master boolean;
  v_admin_role text;
begin
  v_claims := coalesce(event->'claims', '{}'::jsonb);
  begin
    v_uid := nullif(event->>'user_id', '')::uuid;
  exception when others then
    return event;
  end;
  if v_uid is null then
    return event;
  end if;

  begin
    select p.status, p.deleted_at, p.terms_accepted_at, p.terms_version, p.privacy_accepted_at, p.privacy_version,
           p.phone_verified, p.phone_verified_at, p.phone_verification_method, p.provider, p.auth_provider,
           p.email, p.role, p.phone
      into v_row
      from public.profiles p
     where p.id = v_uid;
    if not found then
      return event;
    end if;
    v_has_default_master := exists (
      select 1 from public.user_addresses a
       where a.user_id = v_uid and a.is_active = true and a.is_default_master = true
    );
    select m.role into v_admin_role
      from public.admin_memberships m
     where m.user_id = v_uid and m.status = 'active'
     limit 1;
    v_claims := v_claims || jsonb_build_object(
      'dibay_m', jsonb_build_object(
        'v', 1,
        'status', v_row.status,
        'deleted_at', v_row.deleted_at,
        'terms_accepted_at', v_row.terms_accepted_at,
        'terms_version', v_row.terms_version,
        'privacy_accepted_at', v_row.privacy_accepted_at,
        'privacy_version', v_row.privacy_version,
        'reg', 1,
        'phone_verified', v_row.phone_verified,
        'phone_verified_at', v_row.phone_verified_at,
        'phone_verification_method', v_row.phone_verification_method,
        'provider', v_row.provider,
        'auth_provider', v_row.auth_provider,
        'email', v_row.email,
        'role', v_row.role,
        'has_phone', coalesce(btrim(v_row.phone), '') <> '',
        'has_default_master', v_has_default_master,
        'admin_role', v_admin_role
      )
    );
    return jsonb_set(event, '{claims}', v_claims);
  exception when others then
    return event;
  end;
end;
$$;

comment on function public.custom_access_token_hook(jsonb) is
  'D5 + 가입 SSOT — access token claim dibay_m (member status + consent + registration facts) for proxy gates. Never fails token issuance.';

revoke all on function public.custom_access_token_hook(jsonb) from public, anon, authenticated;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;

COMMIT;
