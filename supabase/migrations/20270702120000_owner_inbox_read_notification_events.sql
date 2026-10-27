-- N-01 / N-02 (docs/audit/notification-system-full-audit-2026-10-27.md)
-- Owner commerce inbox read the legacy `public.notifications` table, which stopped
-- receiving rows on 2026-08-12 (writers are canonical-only since Gate 3 Step 10).
-- Re-point both Owner inbox functions at `public.notification_events`:
--   kind     = display_payload.legacyMeta.kind
--   store_id = display_payload.legacyMeta.store_id
--   read     = unread = false OR read_at IS NOT NULL
--   deleted  = display_payload.deleted_at / inbox_dismissed_at / deleted (soft dismiss)
-- Output shape (id, notification_type, title, body, link_url, is_read, created_at, meta) unchanged.
-- Kind list = lib/notifications/owner-store-commerce-notification-meta.ts
--   (+ store_order_accept_timeout_cancelled, + store_point_charge_on_hold in SQL).
-- Rollback: re-apply section A of 20261028120000_global_notification_ssot_owner_admin.sql.

BEGIN;

CREATE OR REPLACE FUNCTION public.owner_store_commerce_notification_kinds()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT ARRAY[
    'store_order_created',
    'store_order_accept_reminder_30s',
    'store_order_accept_reminder_60s',
    'store_order_accept_timeout_cancelled',
    'store_order_payment_completed',
    'store_order_buyer_cancelled',
    'store_order_sold_out',
    'store_order_refund_requested',
    'store_point_blocked',
    'store_point_deducted',
    'store_point_low',
    'store_point_charge_approved',
    'store_point_charge_rejected',
    'store_point_charge_on_hold',
    'store_point_account_replied'
  ]::text[];
$$;

CREATE OR REPLACE FUNCTION public.get_owner_store_commerce_notifications(
  p_user_id uuid,
  p_store_id uuid,
  p_limit integer DEFAULT 200
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', e.id,
        'notification_type', coalesce(nullif(e.display_payload->>'legacyNotificationType', ''), 'commerce'),
        'title', e.title,
        'body', e.body,
        'link_url', e.display_payload->>'routeUrl',
        'is_read', (e.unread = false OR e.read_at IS NOT NULL),
        'created_at', e.created_at,
        'meta', coalesce(e.display_payload->'legacyMeta', '{}'::jsonb)
      )
      ORDER BY e.created_at DESC
    ),
    '[]'::jsonb
  )
  FROM (
    SELECT ne.*
    FROM public.notification_events AS ne
    WHERE ne.user_id = p_user_id
      AND (ne.display_payload->'legacyMeta'->>'kind') = ANY (public.owner_store_commerce_notification_kinds())
      AND trim(coalesce(ne.display_payload->'legacyMeta'->>'store_id', '')) = p_store_id::text
      AND coalesce(ne.display_payload->>'deleted_at', '') = ''
      AND coalesce(ne.display_payload->>'inbox_dismissed_at', '') = ''
      AND coalesce(ne.display_payload->>'deleted', 'false') <> 'true'
    ORDER BY ne.created_at DESC
    LIMIT greatest(1, least(coalesce(p_limit, 200), 220))
  ) AS e;
$$;

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
  owner_rows AS (
    SELECT ne.*
    FROM public.notification_events ne
    WHERE ne.user_id = p_user_id
      AND (ne.display_payload->'legacyMeta'->>'kind') = ANY (public.owner_store_commerce_notification_kinds())
      AND coalesce(ne.display_payload->>'deleted_at', '') = ''
      AND coalesce(ne.display_payload->>'inbox_dismissed_at', '') = ''
      AND coalesce(ne.display_payload->>'deleted', 'false') <> 'true'
  ),
  unread_owner AS (
    SELECT count(*)::integer AS owner_store_commerce
    FROM owner_rows o
    WHERE o.unread = true AND o.read_at IS NULL
  ),
  store_filtered AS (
    SELECT o.*
    FROM owner_rows o
    WHERE p_store_id IS NOT NULL
      AND trim(coalesce(o.display_payload->'legacyMeta'->>'store_id', '')) = p_store_id::text
    ORDER BY o.created_at DESC
    LIMIT (SELECT n FROM cap)
  ),
  notifications_arr AS (
    SELECT coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', sf.id,
          'notification_type', coalesce(nullif(sf.display_payload->>'legacyNotificationType', ''), 'commerce'),
          'title', sf.title,
          'body', sf.body,
          'link_url', sf.display_payload->>'routeUrl',
          'is_read', (sf.unread = false OR sf.read_at IS NOT NULL),
          'created_at', sf.created_at,
          'meta', coalesce(sf.display_payload->'legacyMeta', '{}'::jsonb)
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

COMMIT;
