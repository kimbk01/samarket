-- Store point account inquiry ↔ charge request link (2차)
-- Depends on 20260830140000_store_point_system.sql for full RPC/policies/ledger.
-- Bootstrap below is idempotent when parent tables are missing (Supabase SQL Editor one-shot).

-- ---------------------------------------------------------------------------
-- Prerequisite tables (no-op if 20260830140000 already applied)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.store_point_charge_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  payment_method text NOT NULL DEFAULT 'manual_confirm',
  payment_amount integer NOT NULL DEFAULT 0,
  point_amount integer NOT NULL DEFAULT 0,
  request_status text NOT NULL DEFAULT 'pending',
  depositor_name text NOT NULL DEFAULT '',
  bank_name text NOT NULL DEFAULT '',
  receipt_image_url text NOT NULL DEFAULT '',
  user_memo text NULL,
  admin_memo text NULL,
  approved_by uuid NULL,
  approved_at timestamptz NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.platform_admin_inquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inquiry_type text NOT NULL DEFAULT 'general'
    CHECK (inquiry_type IN ('general', 'store_ops', 'store_point', 'settlement', 'ad')),
  inquiry_kind text NOT NULL DEFAULT 'general'
    CHECK (inquiry_kind IN ('general', 'account_request', 'charge_followup')),
  store_id uuid NULL REFERENCES public.stores(id) ON DELETE SET NULL,
  from_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject text NOT NULL,
  content text NOT NULL,
  attachment_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'answered', 'closed')),
  answer text NULL,
  answered_by uuid NULL,
  answered_at timestamptz NULL,
  related_charge_request_id uuid NULL REFERENCES public.store_point_charge_requests(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_admin_inquiries_status_created
  ON public.platform_admin_inquiries (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_admin_inquiries_type
  ON public.platform_admin_inquiries (inquiry_type, created_at DESC);

-- ---------------------------------------------------------------------------
-- Incremental columns (when 20260830140000 ran before inquiry_kind existed)
-- ---------------------------------------------------------------------------
ALTER TABLE public.platform_admin_inquiries
  ADD COLUMN IF NOT EXISTS inquiry_kind text NOT NULL DEFAULT 'general';

ALTER TABLE public.platform_admin_inquiries
  DROP CONSTRAINT IF EXISTS platform_admin_inquiries_inquiry_kind_check;

ALTER TABLE public.platform_admin_inquiries
  ADD CONSTRAINT platform_admin_inquiries_inquiry_kind_check
  CHECK (inquiry_kind IN ('general', 'account_request', 'charge_followup'));

ALTER TABLE public.store_point_charge_requests
  ADD COLUMN IF NOT EXISTS inquiry_id uuid NULL
  REFERENCES public.platform_admin_inquiries(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_store_point_charge_requests_inquiry_id
  ON public.store_point_charge_requests (inquiry_id)
  WHERE inquiry_id IS NOT NULL;

-- One open account inquiry per store
CREATE UNIQUE INDEX IF NOT EXISTS uq_platform_admin_inquiries_open_account_per_store
  ON public.platform_admin_inquiries (store_id)
  WHERE inquiry_kind = 'account_request' AND status = 'open' AND store_id IS NOT NULL;
