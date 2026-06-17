-- Supabase Security Advisor ERROR (splinter 0010 security_definer_view)
--
-- 대상: public.v_user_auth_identity_email_conflicts (20260914130000_user_auth_identities.sql)
-- 원인: SECURITY DEFINER(기본) + public 스키마 노출.
-- 앱/PostgREST 경로 미사용 — 운영 진단 전용.
--
-- 조치:
--   1) security_invoker = true 로 재생성
--   2) anon/authenticated/PUBLIC SELECT REVOKE — service_role(SQL Editor·서버)만

BEGIN;

DROP VIEW IF EXISTS public.v_user_auth_identity_email_conflicts;

CREATE VIEW public.v_user_auth_identity_email_conflicts
WITH (security_invoker = true)
AS
SELECT
  lower(btrim(i.email)) AS email_lower,
  array_agg(DISTINCT i.user_id) AS user_ids,
  array_agg(DISTINCT i.provider) AS providers,
  COUNT(DISTINCT i.user_id) AS user_count
FROM public.user_auth_identities i
WHERE i.email IS NOT NULL
  AND btrim(i.email) <> ''
  AND i.email_is_private_relay = false
GROUP BY lower(btrim(i.email))
HAVING COUNT(DISTINCT i.user_id) > 1;

COMMENT ON VIEW public.v_user_auth_identity_email_conflicts IS
  '운영 진단: user_auth_identities 이메일 중복. service_role·SQL Editor 전용.';

REVOKE ALL ON TABLE public.v_user_auth_identity_email_conflicts FROM PUBLIC;
REVOKE ALL ON TABLE public.v_user_auth_identity_email_conflicts FROM anon;
REVOKE ALL ON TABLE public.v_user_auth_identity_email_conflicts FROM authenticated;
GRANT SELECT ON TABLE public.v_user_auth_identity_email_conflicts TO service_role;

COMMIT;
