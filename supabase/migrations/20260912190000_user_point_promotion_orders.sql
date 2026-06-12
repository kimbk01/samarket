-- 사용자 포인트 프로모션 주문 (노출 부스트)

BEGIN;

CREATE TABLE IF NOT EXISTS public.point_promotion_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_nickname text NOT NULL DEFAULT '',
  target_type text NOT NULL,
  target_id text NOT NULL,
  target_title text NOT NULL DEFAULT '',
  placement text NOT NULL,
  duration_days integer NOT NULL CHECK (duration_days > 0),
  point_cost integer NOT NULL CHECK (point_cost > 0),
  order_status text NOT NULL DEFAULT 'active',
  start_at timestamptz NOT NULL DEFAULT now(),
  end_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_point_promotion_orders_target
  ON public.point_promotion_orders (target_type, target_id, order_status);

CREATE INDEX IF NOT EXISTS idx_point_promotion_orders_user_created
  ON public.point_promotion_orders (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_point_promotion_orders_active_window
  ON public.point_promotion_orders (order_status, start_at, end_at);

ALTER TABLE public.point_promotion_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS point_promotion_orders_select_own ON public.point_promotion_orders;
CREATE POLICY point_promotion_orders_select_own
  ON public.point_promotion_orders
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS point_promotion_orders_insert_own ON public.point_promotion_orders;
CREATE POLICY point_promotion_orders_insert_own
  ON public.point_promotion_orders
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

COMMIT;
