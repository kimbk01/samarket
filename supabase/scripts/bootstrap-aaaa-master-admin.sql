-- 메인 테스트 관리자: 로그인(/login) 아이디 aaaa / 1234 + 관리자 권한
--
-- 런타임: 아이디 `aaaa` → `aaaa@manual.local` (`lib/auth/manual-member-email.ts` + resolve-identifier).
-- 이 스크립트는 **이미 존재하는** `auth.users` 행(이메일 `aaaa@manual.local`)의 `id`를 찾아
-- `profiles` / `test_users` 만 맞춥니다. UUID를 손으로 붙여넣을 필요가 없습니다.
--
-- 먼저 Auth 사용자가 없으면:
--   `npm run e2e:ensure-aaaa-manual-auth`
--   또는 Dashboard → Authentication → Users 에서 `aaaa@manual.local` 생성
--
-- 실행: Supabase SQL Editor 에서 전체 실행

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
    'super_admin',
    'admin',
    'admin_manual',
    'admin_manual',
    true,
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
    role = EXCLUDED.role,
    member_type = EXCLUDED.member_type,
    auth_provider = EXCLUDED.auth_provider,
    provider = EXCLUDED.provider,
    is_admin = EXCLUDED.is_admin,
    phone_verified = EXCLUDED.phone_verified,
    phone_verification_status = EXCLUDED.phone_verification_status,
    status = EXCLUDED.status,
    member_status = EXCLUDED.member_status,
    updated_at = now();

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
