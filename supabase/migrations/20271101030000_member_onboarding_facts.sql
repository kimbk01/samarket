-- 가입 상태 확인 1회 조회 — 요청 증폭 근본 수정 순서 4.
-- 설계: docs/audit/supabase-request-fanout-full-root-cause-2026-11-01.md §11 (Owner 「순서 4 진행」 2026-11-01)
-- 이전: `getOnboardingStatus` 가 프로필 · 기본 주소(user_addresses) · 활성 관리자(admin_memberships) 를 각각 조회 (1번에 DB 3회).
-- 이 함수는 같은 세 조회를 1회로 돌려준다. 판정(동의·@id·전화·관리자 면제)은 TS 그대로.
--   profile          : 기존 `loadProfileSubset` 과 같은 21개 열 (행 없으면 null)
--   has_default_address : 활성 `is_default_master` 행 존재 = `hasCanonicalDefaultMasterAddress`
--   admin_role       : 활성 membership 의 role (없으면 null) = `loadActiveAdminMembership` (사용자당 활성 1행 unique index)

create or replace function public.member_onboarding_facts(p_user_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'profile', (
      select to_jsonb(p) from (
        select pr.id, pr.username, pr.username_confirmed, pr.dibay_id, pr.dibay_id_locked, pr.display_name,
               pr.avatar_url, pr.nickname, pr.email, pr.role, pr.phone_verified, pr.phone_verified_at,
               pr.phone_verification_method, pr.provider, pr.auth_provider, pr.terms_accepted_at, pr.terms_version,
               pr.privacy_accepted_at, pr.privacy_version, pr.onboarding_completed_at, pr.onboarding_status
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

revoke all on function public.member_onboarding_facts(uuid) from public, anon, authenticated;
grant execute on function public.member_onboarding_facts(uuid) to service_role;
