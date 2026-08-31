-- Delivery Ads product recovery: browse target (1st/2nd) + Business Cash charge requests.
BEGIN;

-- ---------------------------------------------------------------------------
-- store_paid_ad_campaigns: taxonomy browse target (CATEGORY_FEED only)
-- ---------------------------------------------------------------------------
ALTER TABLE public.store_paid_ad_campaigns
  ADD COLUMN IF NOT EXISTS browse_target_kind text NULL
    CHECK (browse_target_kind IS NULL OR browse_target_kind IN ('primary', 'secondary')),
  ADD COLUMN IF NOT EXISTS browse_primary_slug text NULL,
  ADD COLUMN IF NOT EXISTS browse_secondary_slug text NULL;

COMMENT ON COLUMN public.store_paid_ad_campaigns.browse_target_kind IS
  'Product recovery: primary = 1st-level browse (sub=all); secondary = 2nd-level topic. NULL = legacy unscoped.';
COMMENT ON COLUMN public.store_paid_ad_campaigns.browse_primary_slug IS
  'Canonical primary category slug for browse targeting.';
COMMENT ON COLUMN public.store_paid_ad_campaigns.browse_secondary_slug IS
  'Canonical secondary topic slug when browse_target_kind = secondary.';

CREATE INDEX IF NOT EXISTS store_paid_ad_campaigns_browse_target_idx
  ON public.store_paid_ad_campaigns (placement, browse_target_kind, browse_primary_slug)
  WHERE placement = 'stores_browse';

-- ---------------------------------------------------------------------------
-- Business Cash charge requests (Owner structured top-up; Admin verify → ledger credit)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.delivery_ad_business_cash_charge_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  currency text NOT NULL DEFAULT 'PHP',
  request_status text NOT NULL DEFAULT 'pending_deposit'
    CHECK (request_status IN ('pending_deposit', 'under_review', 'completed', 'rejected')),
  owner_memo text NULL,
  admin_memo text NULL,
  payment_reference text NULL,
  reviewed_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz NULL,
  credited_ledger_id uuid NULL,
  client_request_id text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS delivery_ad_cash_charge_owner_client_uidx
  ON public.delivery_ad_business_cash_charge_requests (owner_user_id, client_request_id)
  WHERE client_request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS delivery_ad_cash_charge_status_created_idx
  ON public.delivery_ad_business_cash_charge_requests (request_status, created_at DESC);

CREATE INDEX IF NOT EXISTS delivery_ad_cash_charge_owner_created_idx
  ON public.delivery_ad_business_cash_charge_requests (owner_user_id, created_at DESC);

COMMENT ON TABLE public.delivery_ad_business_cash_charge_requests IS
  'Owner Business Cash top-up requests. Credit only via admin_delivery_ad_business_cash_credit after Admin confirm. Distinct from CUT3 campaign thread and Business Credit.';

ALTER TABLE public.delivery_ad_business_cash_charge_requests ENABLE ROW LEVEL SECURITY;

COMMIT;
