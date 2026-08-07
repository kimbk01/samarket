-- Bootstrap Master (procedure): ensure first Super Admin for the resolved UUID.
--
-- 런타임: 아이디 `aaaa` → `aaaa@manual.local` (`lib/auth/manual-member-email.ts` + resolve-identifier).
-- 이 스크립트는 **이미 존재하는** `auth.users` 행(이메일 `aaaa@manual.local`)의 `id`를 찾아
-- `profiles` / `admin_memberships` / `test_users` 를 맞춥니다.
--
-- Authority:
--   aaaa string = login alias only (NOT privilege)
--   UUID        = Person identity
--   admin_memberships (active, super_admin) = Admin relation SSOT
--   profiles.role / is_admin = NOT privilege (bootstrap leaves non-privileged defaults)
--   test_users.role = legacy QA display debt (not Admin authority)
--
-- 먼저 Auth 사용자가 없으면:
--   `npm run e2e:ensure-aaaa-manual-auth`
--   또는 Dashboard → Authentication → Users 에서 `aaaa@manual.local` 생성
--
-- 실행: Supabase SQL Editor 에서 전체 실행
-- Idempotent: 반복 실행해도 active membership 중복 생성 없음 · 다른 UUID 권한 변경 없음

DO $$
DECLARE
  uid uuid;
BEGIN
  SELECT u.id
  INTO STRICT uid
  FROM auth.users u
  WHERE lower(u.email) = lower('aaaa@manual.local')
  LIMIT 1;

  INSERT INTO public.profiles (
    id,
    email,
    auth_login_email,
    username,
    nickname,
    display_name,
    role,
    member_type,
    auth_provider,
    provider,
    is_admin,
    phone_verified,
    phone_verification_status,
    status,
    member_status,
    updated_at
  )
  VALUES (
    uid,
    'aaaa@manual.local',
    'aaaa@manual.local',
    'aaaa',
    '메인관리자',
    '메인관리자',
    'user',
    'normal',
    'admin_manual',
    'admin_manual',
    false,
    true,
    'verified',
    'verified_user',
    'verified_member',
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    auth_login_email = EXCLUDED.auth_login_email,
    username = EXCLUDED.username,
    nickname = EXCLUDED.nickname,
    display_name = EXCLUDED.display_name,
    -- Do not (re)write privileged role/is_admin mirror — Admin SSOT is admin_memberships
    auth_provider = EXCLUDED.auth_provider,
    provider = EXCLUDED.provider,
    phone_verified = EXCLUDED.phone_verified,
    phone_verification_status = EXCLUDED.phone_verification_status,
    status = EXCLUDED.status,
    member_status = EXCLUDED.member_status,
    updated_at = now();

  -- Admin relation SSOT: same UUID → active super_admin membership
  IF to_regclass('public.admin_memberships') IS NOT NULL THEN
    UPDATE public.admin_memberships
    SET
      role = 'super_admin',
      status = 'active',
      admin_tier = NULL,
      bootstrap_seed = true,
      revoked_at = NULL,
      revoked_by = NULL,
      revoke_reason = NULL,
      updated_at = timezone('utc', now())
    WHERE user_id = uid
      AND status = 'active';

    IF NOT FOUND THEN
      INSERT INTO public.admin_memberships (
        user_id,
        role,
        status,
        admin_tier,
        granted_at,
        granted_by,
        bootstrap_seed,
        created_at,
        updated_at
      )
      SELECT
        uid,
        'super_admin',
        'active',
        NULL,
        timezone('utc', now()),
        NULL,
        true,
        timezone('utc', now()),
        timezone('utc', now())
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.admin_memberships m
        WHERE m.user_id = uid
          AND m.status = 'active'
      );
    END IF;
  END IF;

  -- Legacy QA display row — not Admin authority (POST-HARD-LOCK debt)
  INSERT INTO public.test_users (id, username, password, role, display_name)
  VALUES (uid, 'aaaa', '1234', 'master', '메인관리자')
  ON CONFLICT (id) DO UPDATE SET
    username = EXCLUDED.username,
    password = EXCLUDED.password,
    role = EXCLUDED.role,
    display_name = EXCLUDED.display_name;

EXCEPTION
  WHEN NO_DATA_FOUND THEN
    RAISE EXCEPTION
      'auth.users 에 aaaa@manual.local 가 없습니다. 먼저 사용자를 만든 뒤 다시 실행하세요 (예: npm run e2e:ensure-aaaa-manual-auth 또는 Dashboard → Users).';
END;
$$;
