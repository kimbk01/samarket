-- SAMARKET 회원 중복 진단 SQL (조회 전용)
--
-- 사용법
-- - Supabase SQL Editor 에서 섹션별로 직접 실행한다.
-- - 자동 삭제·자동 병합 SQL 은 포함하지 않는다 (운영자 검토 후 수동 처리).
-- - `provider_user_id` 컬럼/뷰는 `20260427070000_profiles_provider_user_id_unique.sql`
--   마이그레이션 적용 이후에만 사용 가능하다.

-- 1) 같은 (provider, provider_user_id) 의 profiles 가 둘 이상인 케이스
SELECT * FROM public.v_profiles_provider_duplicates;

-- 2) 같은 email 의 profiles 가 둘 이상인 케이스
SELECT * FROM public.v_profiles_email_duplicates;

-- 3) auth.users 가 사라진 orphan profile (운영자 검토 후 수동 처리)
SELECT * FROM public.v_profiles_orphans;

-- 4) auth.users 는 있지만 profiles 가 없는 회원 (ensureUserProfile 가 다음 로그인에서 채울 대상)
SELECT * FROM public.v_auth_users_without_profile;

-- 5) provider/provider_user_id 가 둘 다 비어 있는 SNS 회원 — 신규 진단
--    백필 마이그레이션 직후 보통 0건. 이후에도 남아 있으면 식별 누락 의심.
SELECT id, email, provider, auth_provider, created_at
FROM public.profiles
WHERE provider IN ('google', 'kakao', 'naver', 'apple', 'facebook')
  AND (provider_user_id IS NULL OR btrim(provider_user_id) = '');

-- 6) auth.identities 매핑 확인 (실시간) — 회원이 어떤 provider 로 로그인됐는지
SELECT
  i.user_id,
  i.provider,
  i.provider_id,
  (i.identity_data ->> 'sub') AS sub,
  i.last_sign_in_at,
  u.email AS auth_email
FROM auth.identities i
JOIN auth.users u ON u.id = i.user_id
ORDER BY i.last_sign_in_at DESC NULLS LAST
LIMIT 200;

-- 7) test_users 중 같은 email/phone 으로 profiles 와 겹치는 행 — 수동 병합 후보
SELECT
  t.id AS test_user_id,
  t.username,
  t.display_name,
  t.contact_phone,
  t.created_at,
  p.id AS profile_id,
  p.email,
  p.phone,
  p.created_at AS profile_created_at
FROM public.test_users t
JOIN public.profiles p ON (
  (p.username IS NOT NULL AND lower(btrim(p.username)) = lower(btrim(t.username)))
  OR (p.phone IS NOT NULL AND t.contact_phone IS NOT NULL AND p.phone = t.contact_phone)
)
WHERE t.id <> p.id
ORDER BY t.created_at DESC NULLS LAST
LIMIT 100;

-- 8) 닉네임 중복 진단 (`profiles_nickname_lower_unique_idx` 위반 후보)
SELECT lower(btrim(nickname)) AS nick_key, COUNT(*) AS row_count, array_agg(id) AS profile_ids
FROM public.profiles
WHERE nickname IS NOT NULL AND btrim(nickname) <> ''
GROUP BY 1
HAVING COUNT(*) > 1;
