-- Slice 8 Phase 2 — Platform Business Info CMS (separate from Legal / notices).
BEGIN;

CREATE TABLE IF NOT EXISTS public.app_platform_business_info (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  locale text NOT NULL CHECK (locale IN ('ko', 'en')),
  company_name text NOT NULL DEFAULT '',
  representative_name text NOT NULL DEFAULT '',
  registration_number text NOT NULL DEFAULT '',
  mail_order_number text NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  version text NOT NULL DEFAULT '1',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  published_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT app_platform_business_info_locale_version_uidx UNIQUE (locale, version)
);

CREATE INDEX IF NOT EXISTS idx_app_platform_business_info_public
  ON public.app_platform_business_info (locale, status, published_at DESC NULLS LAST);

COMMENT ON TABLE public.app_platform_business_info IS
  'DIBAY Platform operator business registration CMS (Slice 8 Phase 2). Not legal consent SSOT; not app_notices.';

INSERT INTO public.app_platform_business_info (
  locale, company_name, representative_name, registration_number, mail_order_number,
  address, email, phone, version, status, published_at
) VALUES
(
  'ko',
  'dibaY',
  '',
  '',
  '',
  '',
  'support@dibay.app',
  '',
  '2026-08-phase2',
  'published',
  now()
),
(
  'en',
  'dibaY',
  '',
  '',
  '',
  '',
  'support@dibay.app',
  '',
  '2026-08-phase2',
  'published',
  now()
)
ON CONFLICT (locale, version) DO NOTHING;

COMMIT;
