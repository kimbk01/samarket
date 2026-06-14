-- DIBAY Auth Provider Account Linking — user_auth_identities
-- 식별: (provider, provider_user_id). email 자동 병합 금지.

BEGIN;

CREATE TABLE IF NOT EXISTS public.user_auth_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  provider text NOT NULL,
  provider_user_id text NOT NULL,
  email text,
  email_verified boolean NOT NULL DEFAULT false,
  email_is_private_relay boolean NOT NULL DEFAULT false,
  raw_profile jsonb NOT NULL DEFAULT '{}'::jsonb,
  linked_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT user_auth_identities_provider_check
    CHECK (provider IN ('google', 'kakao', 'apple', 'naver', 'facebook', 'email')),
  CONSTRAINT user_auth_identities_provider_user_id_nonempty
    CHECK (btrim(provider_user_id) <> '')
);

CREATE UNIQUE INDEX IF NOT EXISTS user_auth_identities_provider_user_id_unique_idx
  ON public.user_auth_identities (provider, provider_user_id);

CREATE UNIQUE INDEX IF NOT EXISTS user_auth_identities_user_provider_unique_idx
  ON public.user_auth_identities (user_id, provider);

CREATE INDEX IF NOT EXISTS user_auth_identities_user_id_idx
  ON public.user_auth_identities (user_id);

CREATE INDEX IF NOT EXISTS user_auth_identities_email_lower_idx
  ON public.user_auth_identities (lower(btrim(email)))
  WHERE email IS NOT NULL AND btrim(email) <> '';

-- profiles.provider_user_id 백필 (기존 회원 1 provider = 1 row)
INSERT INTO public.user_auth_identities (
  user_id,
  provider,
  provider_user_id,
  email,
  email_verified,
  email_is_private_relay,
  raw_profile,
  linked_at,
  created_at
)
SELECT
  p.id,
  lower(btrim(COALESCE(p.provider, p.auth_provider))),
  btrim(p.provider_user_id),
  NULLIF(lower(btrim(COALESCE(p.auth_login_email, p.email))), ''),
  CASE WHEN COALESCE(p.auth_login_email, p.email) IS NOT NULL THEN true ELSE false END,
  CASE
    WHEN COALESCE(p.auth_login_email, p.email) ILIKE '%@privaterelay.appleid.com' THEN true
    ELSE false
  END,
  '{}'::jsonb,
  COALESCE(p.created_at, timezone('utc', now())),
  COALESCE(p.created_at, timezone('utc', now()))
FROM public.profiles p
WHERE p.provider_user_id IS NOT NULL
  AND btrim(p.provider_user_id) <> ''
  AND lower(btrim(COALESCE(p.provider, p.auth_provider))) IN ('google', 'kakao', 'apple', 'naver', 'facebook')
ON CONFLICT (provider, provider_user_id) DO NOTHING;

CREATE OR REPLACE VIEW public.v_user_auth_identity_email_conflicts AS
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

ALTER TABLE public.user_auth_identities ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_auth_identities'
      AND policyname = 'user_auth_identities_select_own'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY user_auth_identities_select_own ON public.user_auth_identities
        FOR SELECT
        USING (auth.uid() = user_id)
    $policy$;
  END IF;
END $$;

COMMENT ON TABLE public.user_auth_identities IS
  'DIBAY linked SNS identities — 식별은 (provider, provider_user_id). email 자동 병합 금지.';

COMMIT;
