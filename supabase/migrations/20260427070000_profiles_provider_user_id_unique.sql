-- SAMARKET: SNS 회원 중복 생성 방지 (provider + provider_user_id 식별)
--
-- 목적
-- 1) `profiles` 에 SNS 제공사 고유 ID(`provider_user_id`)를 정식 컬럼으로 둔다.
-- 2) `(provider, provider_user_id)` 부분 UNIQUE 인덱스로 같은 SNS 계정의 이중 회원을 차단.
-- 3) 기존 `auth.identities.provider_id` 값에서 1회 백필(있을 때만).
-- 4) 기존 회원 데이터는 절대 삭제하지 않는다 — 진단용 SELECT 만 별도로 둔다.
--
-- 안전 원칙
-- - 컬럼 추가는 IF NOT EXISTS 로만 (재실행 안전).
-- - UNIQUE INDEX 는 NULL 허용·중복 제외(`WHERE ...`)로 둬 기존 누락 행은 그대로 통과.
-- - 백필은 `ON CONFLICT (id) DO UPDATE` 가 아니라 단순 UPDATE 로만 한다 (PK 변경 없음).

BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS provider_user_id text;

/**
 * `auth.identities` 의 provider_id 를 동일 사용자에 한 번 채워둔다.
 * 동일 사용자에 여러 identity 가 있을 수 있으나 Supabase 는 첫 매칭으로
 * 우선순위(현재 sign-in 한 provider)를 정한다 — 진단/매칭만을 위한 보조값이라
 * 가장 최근 identity 의 provider_id 만 보관해도 충분하다.
 */
UPDATE public.profiles p
SET provider_user_id = COALESCE(
  p.provider_user_id,
  (
    SELECT i.provider_id
    FROM auth.identities i
    WHERE i.user_id = p.id
      AND lower(i.provider) = lower(COALESCE(p.provider, p.auth_provider, 'email'))
    ORDER BY i.last_sign_in_at DESC NULLS LAST, i.created_at DESC NULLS LAST
    LIMIT 1
  )
)
WHERE p.provider_user_id IS NULL;

CREATE INDEX IF NOT EXISTS profiles_provider_user_id_idx
  ON public.profiles (provider, provider_user_id)
  WHERE provider_user_id IS NOT NULL;

/**
 * 같은 (provider, provider_user_id) 가 두 개 이상이라면 잘못된 상태다.
 * UNIQUE 적용 전 진단으로 미리 발견할 수 있도록 view 를 만들어 둔다.
 * (행은 절대 삭제하지 않는다 — 운영자가 직접 병합 여부를 결정한다.)
 */
CREATE OR REPLACE VIEW public.v_profiles_provider_duplicates AS
SELECT
  provider,
  provider_user_id,
  COUNT(*) AS row_count,
  array_agg(id ORDER BY created_at NULLS LAST) AS profile_ids
FROM public.profiles
WHERE provider_user_id IS NOT NULL
GROUP BY provider, provider_user_id
HAVING COUNT(*) > 1;

CREATE OR REPLACE VIEW public.v_profiles_email_duplicates AS
SELECT
  lower(btrim(email)) AS email_lower,
  COUNT(*) AS row_count,
  array_agg(id ORDER BY created_at NULLS LAST) AS profile_ids
FROM public.profiles
WHERE email IS NOT NULL
  AND btrim(email) <> ''
GROUP BY lower(btrim(email))
HAVING COUNT(*) > 1;

CREATE OR REPLACE VIEW public.v_profiles_orphans AS
SELECT p.id, p.email, p.created_at
FROM public.profiles p
LEFT JOIN auth.users u ON u.id = p.id
WHERE u.id IS NULL;

CREATE OR REPLACE VIEW public.v_auth_users_without_profile AS
SELECT u.id, u.email, u.created_at, u.last_sign_in_at
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;

/**
 * UNIQUE 부분 인덱스 — 진단 view 로 중복이 0건임을 확인한 뒤에만 활성화.
 * 이미 같은 (provider, provider_user_id) 의 행이 두 개 이상이라면 인덱스 생성이 실패한다.
 * 이 마이그레이션은 인덱스 생성을 시도하되, 충돌 시 NOTICE 로 우회한다 (운영자가 정리 후 재실행).
 */
DO $$
BEGIN
  BEGIN
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS profiles_provider_user_id_unique_idx '
            'ON public.profiles (provider, provider_user_id) '
            'WHERE provider_user_id IS NOT NULL';
  EXCEPTION WHEN unique_violation OR others THEN
    RAISE NOTICE 'profiles_provider_user_id_unique_idx skipped: %', SQLERRM;
  END;
END $$;

COMMIT;

-- ============================================================
-- 운영자 진단 SQL (자동 실행 금지 — Supabase SQL Editor 에서 직접)
-- ============================================================
--
-- 1) 같은 SNS 고유키 중복:
--   SELECT * FROM public.v_profiles_provider_duplicates;
--
-- 2) 같은 이메일 중복:
--   SELECT * FROM public.v_profiles_email_duplicates;
--
-- 3) auth.users 가 사라진 orphan profile (운영자 검토 후 수동 처리):
--   SELECT * FROM public.v_profiles_orphans;
--
-- 4) profiles 가 비어 있는 auth user (ensureUserProfile 폴백 대상):
--   SELECT * FROM public.v_auth_users_without_profile;
--
-- 중복이 발견되면 가장 오래된 정상 회원을 master 로 두고
-- 연결 데이터(포인트/거래/채팅/주문/주소/신고)가 0건인 보조 row 만 운영자가 수동 삭제.
-- 자동 삭제는 절대 수행하지 않는다.
