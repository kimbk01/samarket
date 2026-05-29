-- Store order cancellation request policy.

ALTER TABLE public.store_orders
  DROP CONSTRAINT IF EXISTS store_orders_order_status_check;

ALTER TABLE public.store_orders
  ADD CONSTRAINT store_orders_order_status_check
  CHECK (
    order_status IN (
      'pending',
      'accepted',
      'preparing',
      'ready_for_pickup',
      'delivering',
      'arrived',
      'completed',
      'cancel_requested',
      'cancelled',
      'refund_requested',
      'refunded'
    )
  );

CREATE TABLE IF NOT EXISTS public.store_order_cancel_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.store_orders(id) ON DELETE CASCADE,
  previous_order_status text,
  requested_by uuid,
  requested_role text NOT NULL CHECK (requested_role IN ('buyer', 'owner', 'admin', 'system')),
  reason text NOT NULL DEFAULT '',
  detail_reason text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'refunded', 'partial_refunded')),
  approved_by uuid,
  approved_at timestamptz,
  rejected_at timestamptz,
  rejected_reason text,
  refund_status text NOT NULL DEFAULT 'not_started' CHECK (refund_status IN ('not_started', 'pending', 'refunded', 'partial_refunded', 'not_applicable')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_store_order_cancel_requests_order_id_created
  ON public.store_order_cancel_requests(order_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_store_order_cancel_requests_status_created
  ON public.store_order_cancel_requests(status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_store_order_cancel_requests_one_pending
  ON public.store_order_cancel_requests(order_id)
  WHERE status = 'pending';
