-- Hub badge wave3: refund + pending order + open inquiry counts in one round-trip.
-- Mirrors: countRefundRequestedForStore, countPendingAcceptForStore, countOpenStoreInquiriesForStore.

CREATE OR REPLACE FUNCTION public.get_owner_hub_store_attention_counts(p_store_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH order_counts AS (
    SELECT
      coalesce(
        sum(CASE WHEN o.order_status = 'refund_requested' THEN 1 ELSE 0 END),
        0
      )::int AS refund_pending_count,
      coalesce(
        sum(CASE WHEN o.order_status = 'pending' THEN 1 ELSE 0 END),
        0
      )::int AS order_pending_count
    FROM public.store_orders AS o
    WHERE o.store_id = p_store_id
      AND o.order_status IN ('refund_requested', 'pending')
  ),
  inquiry_counts AS (
    SELECT coalesce(count(*)::int, 0) AS inquiry_pending_count
    FROM public.store_inquiries AS i
    WHERE i.store_id = p_store_id
      AND i.status = 'open'
  )
  SELECT jsonb_build_object(
    'refund_pending_count', (SELECT refund_pending_count FROM order_counts),
    'order_pending_count', (SELECT order_pending_count FROM order_counts),
    'inquiry_pending_count', (SELECT inquiry_pending_count FROM inquiry_counts)
  );
$$;

COMMENT ON FUNCTION public.get_owner_hub_store_attention_counts(uuid) IS
  'Owner hub badge store_attention — single SQL for refund/pending orders + open inquiries.';

REVOKE ALL ON FUNCTION public.get_owner_hub_store_attention_counts(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_owner_hub_store_attention_counts(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.get_owner_hub_store_attention_counts(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_owner_hub_store_attention_counts(uuid) TO service_role;
