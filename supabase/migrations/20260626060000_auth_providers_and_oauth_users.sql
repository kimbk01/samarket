CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.auth_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL UNIQUE,
  enabled boolean NOT NULL DEFAULT false,
  client_id text NOT NULL DEFAULT '',
  client_secret text NOT NULL DEFAULT '',
  redirect_uri text NOT NULL DEFAULT '',
  scope text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT auth_providers_provider_check
    CHECK (provider IN ('google', 'kakao', 'naver', 'apple', 'facebook'))
);

CREATE INDEX IF NOT EXISTS auth_providers_enabled_sort_order_idx
  ON public.auth_providers (enabled, sort_order, provider);

CREATE OR REPLACE FUNCTION public.set_auth_providers_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = timezone('utc', now());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auth_providers_updated_at ON public.auth_providers;
CREATE TRIGGER trg_auth_providers_updated_at
BEFORE UPDATE ON public.auth_providers
FOR EACH ROW
EXECUTE FUNCTION public.set_auth_providers_updated_at();

INSERT INTO public.auth_providers (
  provider,
  enabled,
  client_id,
  client_secret,
  redirect_uri,
  scope,
  sort_order
)
VALUES
  ('google', false, '', '', '', '', 1),
  ('kakao', false, '', '', '', '', 2),
  ('naver', false, '', '', '', '', 3),
  ('apple', false, '', '', '', '', 4),
  ('facebook', false, '', '', '', '', 5)
ON CONFLICT (provider) DO UPDATE
SET
  sort_order = EXCLUDED.sort_order;

CREATE TABLE IF NOT EXISTS public.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  provider_id text NOT NULL,
  email text NOT NULL DEFAULT '',
  name text NOT NULL DEFAULT '',
  phone text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT users_provider_check
    CHECK (provider IN ('google', 'kakao', 'naver', 'apple', 'facebook')),
  CONSTRAINT users_provider_provider_id_unique UNIQUE (provider, provider_id)
);

CREATE INDEX IF NOT EXISTS users_provider_provider_id_idx
  ON public.users (provider, provider_id);

CREATE INDEX IF NOT EXISTS users_email_idx
  ON public.users (email);

CREATE OR REPLACE FUNCTION public.set_users_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = timezone('utc', now());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_users_updated_at ON public.users;
CREATE TRIGGER trg_users_updated_at
BEFORE UPDATE ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.set_users_updated_at();
