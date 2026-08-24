-- A — Coupon redemption ledger + order FK (checkout authority extension).

BEGIN;

ALTER TABLE public.store_orders
  ADD COLUMN IF NOT EXISTS coupon_campaign_id uuid NULL
    REFERENCES public.store_coupon_campaigns (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.store_orders.coupon_campaign_id IS
  'Stores A — applied store_coupon_campaigns row at checkout (server authority).';

CREATE TABLE IF NOT EXISTS public.store_coupon_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.store_coupon_campaigns (id) ON DELETE RESTRICT,
  store_id uuid NOT NULL REFERENCES public.stores (id) ON DELETE CASCADE,
  buyer_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  order_id uuid NOT NULL UNIQUE REFERENCES public.store_orders (id) ON DELETE CASCADE,
  discount_amount_applied numeric(12, 2) NOT NULL CHECK (discount_amount_applied > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT store_coupon_redemptions_buyer_campaign_unique UNIQUE (buyer_user_id, campaign_id)
);

COMMENT ON TABLE public.store_coupon_redemptions IS
  'One redemption per buyer per coupon campaign (PRODUCT). Tied to authoritative order row.';

CREATE INDEX IF NOT EXISTS store_coupon_redemptions_campaign_idx
  ON public.store_coupon_redemptions (campaign_id, created_at DESC);

ALTER TABLE public.store_coupon_redemptions ENABLE ROW LEVEL SECURITY;

COMMIT;
