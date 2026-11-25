-- 관리자 API 인증 확인 1회 조회 (Owner 「S3 진행」 2026-11-25 · Auth HARD LOCK Amendment 2026-11-25)
--
-- First Break (Vercel 관측 · 운영): 관리자 API 요청마다 인증 확인으로 DB 를 3번 왕복한다.
--   profiles 1.00 · user_sessions 0.96 · admin_memberships 0.92 / 요청 (관리자 종 11-24 04~08 UTC, 요청 133).
--   세션 확인 캐시 10초 · 관리자 판정 캐시 15초 < 관리자 종 폴링 75초 → 거의 매번 적중 실패.
--   근거: docs/audit/supabase-request-surge-2026-11-18/budget-alert-defects-design-2026-11-24.md D4·S3
--
-- Contract delta: 판정 의미 없음 — 같은 세 행을 한 번에 읽어 돌려줄 뿐, 판정은 TS 그대로
--   (로그인 금지 상태 · 세션 등록 active · 활성 membership role · 정지 운영자 차단).
--   - profile: fetchProfileRowSafe 의 SELECT_FULL 과 같은 열 (계약 시험이 두 목록 일치 확인)
--   - session: user_sessions(user_id, session_id) 의 active · invalidation_reason (inspectUserSessionRegistry 와 같은 조건)
--   - membership: admin_memberships(user_id, status='active') — loadActiveAdminMembership 과 같은 열·조건
-- 캐시 없음 — 매 요청 DB 를 새로 읽는다 (권한·세션 회수 반영은 기존 캐시 10~15초보다 빠르거나 같다).
-- 실행 권한: service_role 만 (member_write_gate_snapshot 과 같은 방식).

create or replace function public.admin_api_actor_context(p_user_id uuid, p_session_id text)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'profile', (
      select to_jsonb(p)
        from (select id, email, display_name, nickname, avatar_url, profile_completed, bio, region_code, region_name, address_street_line, address_detail, latitude, longitude, full_address, phone, phone_country_code, phone_number, phone_verified, phone_verification_status, phone_verified_at, phone_verification_method, phone_verification_requested_at, auth_login_email, realname, realname_verified, status, member_status, role, is_admin, member_type, is_special_member, points, manner_score, trust_score, preferred_language, preferred_country, provider, provider_user_id, active_session_id, last_login_at, last_device_info, created_by_admin, terms_accepted_at, terms_version, privacy_accepted_at, privacy_version, deleted_at, deletion_requested_at, manual_account_type, notify_commerce_email, created_at, updated_at, username, dibay_id, dibay_id_locked, dibay_id_auto_assigned, dibay_id_state, dibay_id_can_change, dibay_id_changed_once, dibay_id_changed_at, username_confirmed, onboarding_status, onboarding_completed_at, auth_provider
                from public.profiles
               where id = p_user_id) p
    ),
    'session', (
      select jsonb_build_object('active', s.active, 'invalidation_reason', s.invalidation_reason)
        from public.user_sessions s
       where s.user_id = p_user_id
         and s.session_id = nullif(btrim(coalesce(p_session_id, '')), '')
    ),
    'membership', (
      select to_jsonb(m)
        from (select id, user_id, role, status, admin_tier, granted_at, granted_by,
                     revoked_at, revoked_by, revoke_reason, bootstrap_seed
                from public.admin_memberships
               where user_id = p_user_id
                 and status = 'active') m
    )
  );
$$;

revoke all on function public.admin_api_actor_context(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_api_actor_context(uuid, text) to service_role;
