-- Supabase Security Advisor ERROR (splinter export ckdosyydvgzqwpbwuhon, post phase2/3)
--
-- 0002 auth_users_exposed — v_profiles_orphans, v_auth_users_without_profile
-- 0010 security_definer_view — 위 2개 + v_profiles_provider_duplicates, v_profiles_email_duplicates
--
-- 원인: 20260427070000 에서 만든 운영 진단 뷰가 public·SECURITY DEFINER(기본) + anon SELECT 가능.
-- 앱/PostgREST 경로에서는 사용하지 않음 — supabase/scripts/diagnose-duplicate-members.sql 전용.
--
-- 조치:
--   1) security_invoker = true 로 재생성
--   2) anon/authenticated/PUBLIC SELECT REVOKE — service_role(SQL Editor·서버)만

BEGIN;

DROP VIEW IF EXISTS public.v_profiles_provider_duplicates;
CREATE VIEW public.v_profiles_provider_duplicates
WITH (security_invoker = true)
AS
SELECT
  provider,
  provider_user_id,
  COUNT(*) AS row_count,
  array_agg(id ORDER BY created_at NULLS LAST) AS profile_ids
FROM public.profiles
WHERE provider_user_id IS NOT NULL
GROUP BY provider, provider_user_id
HAVING COUNT(*) > 1;

COMMENT ON VIEW public.v_profiles_provider_duplicates IS
  '운영 진단: (provider, provider_user_id) 중복. service_role·SQL Editor 전용.';

DROP VIEW IF EXISTS public.v_profiles_email_duplicates;
CREATE VIEW public.v_profiles_email_duplicates
WITH (security_invoker = true)
AS
SELECT
  lower(btrim(email)) AS email_lower,
  COUNT(*) AS row_count,
  array_agg(id ORDER BY created_at NULLS LAST) AS profile_ids
FROM public.profiles
WHERE email IS NOT NULL
  AND btrim(email) <> ''
GROUP BY lower(btrim(email))
HAVING COUNT(*) > 1;

COMMENT ON VIEW public.v_profiles_email_duplicates IS
  '운영 진단: 이메일 중복 profiles. service_role·SQL Editor 전용.';

DROP VIEW IF EXISTS public.v_profiles_orphans;
CREATE VIEW public.v_profiles_orphans
WITH (security_invoker = true)
AS
SELECT p.id, p.email, p.created_at
FROM public.profiles p
LEFT JOIN auth.users u ON u.id = p.id
WHERE u.id IS NULL;

COMMENT ON VIEW public.v_profiles_orphans IS
  '운영 진단: auth.users 없는 orphan profile. service_role·SQL Editor 전용.';

DROP VIEW IF EXISTS public.v_auth_users_without_profile;
CREATE VIEW public.v_auth_users_without_profile
WITH (security_invoker = true)
AS
SELECT u.id, u.email, u.created_at, u.last_sign_in_at
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;

COMMENT ON VIEW public.v_auth_users_without_profile IS
  '운영 진단: profiles 없는 auth user. service_role·SQL Editor 전용.';

DO $$
DECLARE
  v_view text;
BEGIN
  FOREACH v_view IN ARRAY ARRAY[
    'v_profiles_provider_duplicates',
    'v_profiles_email_duplicates',
    'v_profiles_orphans',
    'v_auth_users_without_profile'
  ]
  LOOP
    IF to_regclass(format('public.%I', v_view)) IS NULL THEN
      CONTINUE;
    END IF;
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC', v_view);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', v_view);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM authenticated', v_view);
    EXECUTE format('GRANT SELECT ON TABLE public.%I TO service_role', v_view);
  END LOOP;
END $$;

COMMIT;
