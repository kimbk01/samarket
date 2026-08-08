-- Community Paid Exposure: hold rows for pending point_promotion_orders.
-- CONTRACT: docs/dibay-paid-exposure-feed-ad-master-contract.md
-- Additive. Does not drop post_ads (legacy read).

BEGIN;

CREATE TABLE IF NOT EXISTS public.promotion_point_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  promotion_order_id uuid NOT NULL REFERENCES public.point_promotion_orders(id) ON DELETE CASCADE,
  amount integer NOT NULL CHECK (amount >= 0),
  status text NOT NULL DEFAULT 'held'
    CHECK (status IN ('held', 'released', 'captured')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_promotion_point_holds_order
  ON public.promotion_point_holds (promotion_order_id, status);
CREATE INDEX IF NOT EXISTS idx_promotion_point_holds_user
  ON public.promotion_point_holds (user_id);

ALTER TABLE public.promotion_point_holds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS promotion_point_holds_select_own ON public.promotion_point_holds;
CREATE POLICY promotion_point_holds_select_own
  ON public.promotion_point_holds FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

COMMENT ON TABLE public.promotion_point_holds IS
  'HOLD for pending Community (and future) paid exposure. CAPTURE on approve, RELEASE on reject.';

-- Allow pending_review / rejected statuses on orders (no CHECK historically).
COMMENT ON COLUMN public.point_promotion_orders.order_status IS
  'active | pending_review | rejected | ended | cancelled — community uses pending_review until admin approve.';

ALTER TABLE public.point_promotion_orders
  ADD COLUMN IF NOT EXISTS review_reason text;

COMMENT ON COLUMN public.point_promotion_orders.review_reason IS
  'Admin reject/approve note for community paid exposure (pending_review path).';

COMMIT;
