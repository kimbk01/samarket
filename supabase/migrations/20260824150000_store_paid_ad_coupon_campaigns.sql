-- A — Stores paid ad + coupon insertion authority (separate from feed_ad_campaigns / store_discovery_campaigns).
-- Discovery ranking / organic sort: OUT. Composition insertion consumes these rows only.

BEGIN;

CREATE TABLE IF NOT EXISTS public.store_paid_ad_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores (id) ON DELETE CASCADE,
  placement text NOT NULL
    CHECK (placement IN ('stores_home', 'stores_browse')),
  title text NOT NULL,
  headline text NOT NULL DEFAULT '',
  body_copy text NULL,
  image_url text NULL,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by_user_id uuid NULL,
  updated_by_user_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT store_paid_ad_campaigns_window_chk CHECK (end_at > start_at)
);

COMMENT ON TABLE public.store_paid_ad_campaigns IS
  'Stores A — paid placement authority. Active = is_active AND start_at <= now() AND end_at > now(). Not feed_ad_campaigns.';

CREATE INDEX IF NOT EXISTS store_paid_ad_campaigns_active_window_idx
  ON public.store_paid_ad_campaigns (placement, is_active, start_at, end_at)
  WHERE is_active = true;

CREATE TABLE IF NOT EXISTS public.store_coupon_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores (id) ON DELETE CASCADE,
  title text NOT NULL,
  discount_type text NOT NULL
    CHECK (discount_type IN ('percent', 'fixed_amount')),
  discount_value numeric(12, 2) NOT NULL CHECK (discount_value > 0),
  min_order_amount numeric(12, 2) NULL CHECK (min_order_amount IS NULL OR min_order_amount >= 0),
  terms_copy text NULL,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by_user_id uuid NULL,
  updated_by_user_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT store_coupon_campaigns_window_chk CHECK (end_at > start_at)
);

COMMENT ON TABLE public.store_coupon_campaigns IS
  'Stores A — coupon insertion terms authority. Checkout redemption is separate (may be NOT_IMPLEMENTED).';

CREATE INDEX IF NOT EXISTS store_coupon_campaigns_active_window_idx
  ON public.store_coupon_campaigns (is_active, start_at, end_at)
  WHERE is_active = true;

ALTER TABLE public.store_paid_ad_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_coupon_campaigns ENABLE ROW LEVEL SECURITY;

COMMIT;
