-- Owner dashboard notifications: unified snapshot (1 PostgREST RTT cold path).
-- Semantics aligned with owner_store_commerce unread + get_owner_store_commerce_notifications list.

CREATE TABLE IF NOT EXISTS public.owner_dashboard_notifications_snapshots (
  user_id uuid NOT NULL,
  store_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'::uuid,
  snapshot_kind text NOT NULL DEFAULT 'owner_store',
  limit_n integer NOT NULL DEFAULT 200,
  cursor_token text NOT NULL DEFAULT '',
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, store_id, snapshot_kind, limit_n, cursor_token)
);

COMMENT ON TABLE public.owner_dashboard_notifications_snapshots IS
  'Precomputed owner dashboard notifications (unread + store list). Event-driven refresh; read path 1 PK select.';

CREATE INDEX IF NOT EXISTS idx_owner_dashboard_notifications_snapshots_updated
  ON public.owner_dashboard_notifications_snapshots (updated_at DESC);

ALTER TABLE public.owner_dashboard_notifications_snapshots ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.get_owner_dashboard_notifications_snapshot(
  p_user_id uuid,
  p_store_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 200,
  p_cursor text DEFAULT ''
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH cap AS (
    SELECT greatest(1, least(coalesce(p_limit, 200), 220))::integer AS n
  ),
  owner_kinds AS (
    SELECT unnest(ARRAY[
      'store_order_created',
      'store_order_accept_reminder_30s',
      'store_order_accept_reminder_60s',
      'store_order_payment_completed',
      'store_order_buyer_cancelled',
      'store_order_refund_requested'
    ]::text[]) AS kind
  ),
  owner_rows AS (
    SELECT n.*
    FROM public.notifications n
    WHERE n.user_id = p_user_id
      AND n.notification_type = 'commerce'
      AND (n.meta->>'kind') IN (SELECT kind FROM owner_kinds)
  ),
  unread_owner AS (
    SELECT count(*)::integer AS owner_store_commerce
    FROM owner_rows o
    WHERE coalesce(o.is_read, false) = false
  ),
  store_filtered AS (
    SELECT n.*
    FROM owner_rows n
    WHERE p_store_id IS NOT NULL
      AND trim(coalesce(n.meta->>'store_id', '')) = p_store_id::text
    ORDER BY n.created_at DESC
    LIMIT (SELECT n FROM cap)
  ),
  notifications_arr AS (
    SELECT coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', sf.id,
          'notification_type', sf.notification_type,
          'title', sf.title,
          'body', sf.body,
          'link_url', sf.link_url,
          'is_read', sf.is_read,
          'created_at', sf.created_at,
          'meta', sf.meta
        )
        ORDER BY sf.created_at DESC
      ),
      '[]'::jsonb
    ) AS notifications
    FROM store_filtered sf
  )
  SELECT jsonb_build_object(
    'unread_counts', jsonb_build_object(
      'owner_store_commerce', coalesce((SELECT owner_store_commerce FROM unread_owner), 0)
    ),
    'notifications', (SELECT notifications FROM notifications_arr),
    'latest_orders', '[]'::jsonb,
    'latest_inquiries', '[]'::jsonb,
    'latest_messages', '[]'::jsonb,
    'preview_summaries', '[]'::jsonb,
    'store_id', CASE WHEN p_store_id IS NULL THEN NULL ELSE p_store_id::text END,
    'cursor', coalesce(nullif(trim(p_cursor), ''), ''),
    'updated_at', now()
  );
$$;

COMMENT ON FUNCTION public.get_owner_dashboard_notifications_snapshot(uuid, uuid, integer, text) IS
  'Owner dashboard notifications cold path — owner commerce unread + optional store list in one SQL snapshot.';

REVOKE ALL ON FUNCTION public.get_owner_dashboard_notifications_snapshot(uuid, uuid, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_owner_dashboard_notifications_snapshot(uuid, uuid, integer, text) FROM anon;
REVOKE ALL ON FUNCTION public.get_owner_dashboard_notifications_snapshot(uuid, uuid, integer, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_owner_dashboard_notifications_snapshot(uuid, uuid, integer, text) TO service_role;
