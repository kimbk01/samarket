-- 메인 테스트 관리자: 로그인(/login) 아이디 로그인 aaaa / 1234 + 관리자 권한(master)
--
-- 1) Supabase Dashboard → Authentication → Users → Add user
--    - Email: aaaa@samarket.local
--    - Password: 1234
--    - Auto Confirm User: ON
-- 2) 해당 사용자 UUID 복사 후, 아래 두 곳의 REPLACE_WITH_AUTH_USER_UUID 를 동일하게 치환
-- 3) SQL Editor 에서 전체 실행

INSERT INTO public.profiles (
  id,
  email,
  username,
  nickname,
  role,
  member_type,
  auth_provider,
  phone_verified,
  phone_verification_status,
  status
)
VALUES (
  'REPLACE_WITH_AUTH_USER_UUID'::uuid,
  'aaaa@samarket.local',
  'aaaa',
  '메인관리자',
  'master',
  'admin',
  'manual_bootstrap',
  true,
  'verified',
  'active'
)
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  username = EXCLUDED.username,
  nickname = EXCLUDED.nickname,
  role = EXCLUDED.role,
  member_type = EXCLUDED.member_type,
  auth_provider = EXCLUDED.auth_provider,
  phone_verified = EXCLUDED.phone_verified,
  phone_verification_status = EXCLUDED.phone_verification_status,
  status = EXCLUDED.status,
  updated_at = now();

INSERT INTO public.test_users (id, username, password, role, display_name)
VALUES (
  'REPLACE_WITH_AUTH_USER_UUID'::uuid,
  'aaaa',
  '1234',
  'master',
  '메인관리자'
)
ON CONFLICT (id) DO UPDATE SET
  username = EXCLUDED.username,
  password = EXCLUDED.password,
  role = EXCLUDED.role,
  display_name = EXCLUDED.display_name;
