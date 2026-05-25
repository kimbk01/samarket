-- Delivery summary aggregate: unified snapshot (1 PostgREST RTT cold path).
-- Wraps get_owner_store_ops_dashboard_snapshot; DSA1 alias fields + full owner ops payload.

CREATE TABLE IF NOT EXISTS public.delivery_summary_snapshots (
  store_id uuid NOT NULL,
  owner_user_id uuid NOT NULL,
  summary_scope text NOT NULL DEFAULT 'owner_dashboard',
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (store_id, owner_user_id, summary_scope)
);

COMMENT ON TABLE public.delivery_summary_snapshots IS
  'Precomputed owner delivery summary (order counts, sales, rider, badges). Event-driven refresh; read path 1 PK select.';

CREATE INDEX IF NOT EXISTS idx_delivery_summary_snapshots_updated
  ON public.delivery_summary_snapshots (updated_at DESC);

ALTER TABLE public.delivery_summary_snapshots ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.get_delivery_summary_snapshot(
  p_store_id uuid,
  p_owner_user_id uuid,
  p_summary_scope text DEFAULT 'owner_dashboard'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dash jsonb;
  v_scope text := coalesce(nullif(trim(p_summary_scope), ''), 'owner_dashboard');
BEGIN
  v_dash := public.get_owner_store_ops_dashboard_snapshot(p_store_id, p_owner_user_id);

  IF coalesce(v_dash->>'ok', '') <> 'true' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', coalesce(v_dash->>'error', 'forbidden'),
      'summary_scope', v_scope,
      'updated_at', now()
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'summary_scope', v_scope,
    'today_sales', coalesce((v_dash->>'today_completed_sales_amount')::bigint, 0),
    'pending_orders', coalesce((v_dash->>'pending_accept_count')::integer, 0),
    'preparing_orders', coalesce((v_dash->>'flow_cooking_count')::integer, 0),
    'delivering_orders', coalesce((v_dash->>'flow_delivering_count')::integer, 0),
    'completed_orders', coalesce((v_dash->>'flow_completed_today_count')::integer, 0),
    'cancelled_orders', coalesce((v_dash->>'today_cancelled_count')::integer, 0),
    'refund_pending', coalesce((v_dash->>'refund_requested_count')::integer, 0),
    'rider_summary', jsonb_build_object(
      'rider_unassigned_count', coalesce((v_dash->>'rider_unassigned_count')::integer, 0),
      'delivery_delay_count', coalesce((v_dash->>'delivery_delay_count')::integer, 0),
      'flow_delivering_delayed_count', coalesce((v_dash->>'flow_delivering_delayed_count')::integer, 0)
    ),
    'dashboard_badges', jsonb_build_object(
      'pending_accept', coalesce((v_dash->>'pending_accept_count')::integer, 0),
      'refund_requested', coalesce((v_dash->>'refund_requested_count')::integer, 0),
      'in_progress', coalesce((v_dash->>'in_progress_count')::integer, 0),
      'pending_delivery', coalesce((v_dash->>'pending_delivery_count')::integer, 0)
    ),
    'latest_orders', '[]'::jsonb,
    'owner_store_ops_snapshot', v_dash,
    'updated_at', now()
  );
END;
$$;

COMMENT ON FUNCTION public.get_delivery_summary_snapshot(uuid, uuid, text) IS
  'Owner delivery summary cold path — gate + KPI aggregates + full OwnerStoreOpsSnapshot in one SQL snapshot.';

REVOKE ALL ON FUNCTION public.get_delivery_summary_snapshot(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_delivery_summary_snapshot(uuid, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.get_delivery_summary_snapshot(uuid, uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_delivery_summary_snapshot(uuid, uuid, text) TO service_role;
