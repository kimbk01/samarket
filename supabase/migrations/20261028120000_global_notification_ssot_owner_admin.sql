-- GATE 4: Owner commerce kind parity (sold_out + store_point_*) + Admin RT publication/RLS
-- DO NOT invent kinds — match lib/notifications/owner-store-commerce-notification-meta.ts

BEGIN;

-- ---------------------------------------------------------------------------
-- A. Owner store commerce kinds (SQL ↔ TS)
-- ---------------------------------------------------------------------------

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
        'id', n.id,
        'notification_type', n.notification_type,
        'title', n.title,
        'body', n.body,
        'link_url', n.link_url,
        'is_read', n.is_read,
        'created_at', n.created_at,
        'meta', n.meta
      )
      ORDER BY n.created_at DESC
    ),
    '[]'::jsonb
  )
  FROM (
    SELECT n.*
    FROM public.notifications AS n
    WHERE n.user_id = p_user_id
      AND n.notification_type = 'commerce'
      AND (n.meta->>'kind') IN (
        'store_order_created',
        'store_order_accept_reminder_30s',
        'store_order_accept_reminder_60s',
        'store_order_payment_completed',
        'store_order_buyer_cancelled',
        'store_order_sold_out',
        'store_order_refund_requested',
        'store_point_blocked',
        'store_point_deducted',
        'store_point_low',
        'store_point_charge_approved',
        'store_point_charge_rejected',
        'store_point_account_replied'
      )
      AND trim(coalesce(n.meta->>'store_id', '')) = p_store_id::text
    ORDER BY n.created_at DESC
    LIMIT greatest(1, least(coalesce(p_limit, 200), 220))
  ) AS n;
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
  owner_kinds AS (
    SELECT unnest(ARRAY[
      'store_order_created',
      'store_order_accept_reminder_30s',
      'store_order_accept_reminder_60s',
      'store_order_payment_completed',
      'store_order_buyer_cancelled',
      'store_order_sold_out',
      'store_order_refund_requested',
      'store_point_blocked',
      'store_point_deducted',
      'store_point_low',
      'store_point_charge_approved',
      'store_point_charge_rejected',
      'store_point_account_replied'
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

CREATE OR REPLACE FUNCTION public.count_notification_unread_segmented(
  p_user_id uuid,
  p_segment text
)
RETURNS bigint
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_surface text;
  v_cnt integer;
BEGIN
  v_surface := CASE btrim(coalesce(p_segment, ''))
    WHEN 'all' THEN 'all'
    WHEN 'consumer' THEN 'tier1_inbox_bell'
    WHEN 'consumer_no_chat' THEN 'tier1_inbox_bell'
    WHEN 'owner_store_commerce' THEN 'owner_commerce_inbox'
    WHEN 'bottom_nav' THEN 'bottom_nav_my'
    WHEN 'bottom_nav_no_chat' THEN 'bottom_nav_my'
    ELSE NULL
  END;

  IF v_surface IS NULL THEN
    RETURN 0;
  END IF;

  IF v_surface = 'all' THEN
    SELECT public.count_notification_targets(p_user_id, 'all', NULL) INTO v_cnt;
  ELSE
    SELECT public.count_notification_targets(p_user_id, v_surface, NULL) INTO v_cnt;
  END IF;

  IF v_cnt IS NULL OR v_cnt = 0 THEN
    RETURN (
      SELECT count(*)::bigint
      FROM public.notifications AS n
      WHERE n.user_id = p_user_id
        AND n.is_read = false
        AND CASE btrim(coalesce(p_segment, ''))
          WHEN 'all' THEN true
          WHEN 'owner_store_commerce' THEN
            n.notification_type = 'commerce'
            AND (n.meta->>'kind') IN (
              'store_order_created',
              'store_order_accept_reminder_30s',
              'store_order_accept_reminder_60s',
              'store_order_payment_completed',
              'store_order_buyer_cancelled',
              'store_order_sold_out',
              'store_order_refund_requested',
              'store_point_blocked',
              'store_point_deducted',
              'store_point_low',
              'store_point_charge_approved',
              'store_point_charge_rejected',
              'store_point_account_replied'
            )
          WHEN 'consumer' THEN
            coalesce(n.notification_type, '') <> 'commerce'
            OR (
              n.notification_type = 'commerce'
              AND coalesce(n.meta->>'kind', '') NOT IN (
                'store_order_created',
                'store_order_accept_reminder_30s',
                'store_order_accept_reminder_60s',
                'store_order_payment_completed',
                'store_order_buyer_cancelled',
                'store_order_sold_out',
                'store_order_refund_requested',
                'store_point_blocked',
                'store_point_deducted',
                'store_point_low',
                'store_point_charge_approved',
                'store_point_charge_rejected',
                'store_point_account_replied'
              )
            )
          WHEN 'consumer_no_chat' THEN
            (
              coalesce(n.notification_type, '') <> 'commerce'
              AND coalesce(n.notification_type, '') <> 'chat'
            )
            OR (
              n.notification_type = 'commerce'
              AND coalesce(n.meta->>'kind', '') NOT IN (
                'store_order_created',
                'store_order_accept_reminder_30s',
                'store_order_accept_reminder_60s',
                'store_order_payment_completed',
                'store_order_buyer_cancelled',
                'store_order_sold_out',
                'store_order_refund_requested',
                'store_point_blocked',
                'store_point_deducted',
                'store_point_low',
                'store_point_charge_approved',
                'store_point_charge_rejected',
                'store_point_account_replied',
                'community_chat',
                'trade_chat',
                'group_chat'
              )
            )
          WHEN 'bottom_nav' THEN
            (
              coalesce(n.notification_type, '') <> 'commerce'
              AND coalesce(n.notification_type, '') <> 'chat'
            )
            OR (
              n.notification_type = 'commerce'
              AND coalesce(n.meta->>'kind', '') NOT IN (
                'store_order_created',
                'store_order_accept_reminder_30s',
                'store_order_accept_reminder_60s',
                'store_order_payment_completed',
                'store_order_buyer_cancelled',
                'store_order_sold_out',
                'store_order_refund_requested',
                'store_point_blocked',
                'store_point_deducted',
                'store_point_low',
                'store_point_charge_approved',
                'store_point_charge_rejected',
                'store_point_account_replied',
                'store_order_payment_completed_buyer',
                'store_order_owner_status',
                'store_order_payment_failed',
                'store_order_refund_approved',
                'store_order_auto_completed',
                'community_chat',
                'trade_chat',
                'group_chat'
              )
            )
          WHEN 'bottom_nav_no_chat' THEN
            (
              coalesce(n.notification_type, '') <> 'commerce'
              AND coalesce(n.notification_type, '') <> 'chat'
            )
            OR (
              n.notification_type = 'commerce'
              AND coalesce(n.meta->>'kind', '') NOT IN (
                'store_order_created',
                'store_order_accept_reminder_30s',
                'store_order_accept_reminder_60s',
                'store_order_payment_completed',
                'store_order_buyer_cancelled',
                'store_order_sold_out',
                'store_order_refund_requested',
                'store_point_blocked',
                'store_point_deducted',
                'store_point_low',
                'store_point_charge_approved',
                'store_point_charge_rejected',
                'store_point_account_replied',
                'store_order_payment_completed_buyer',
                'store_order_owner_status',
                'store_order_payment_failed',
                'store_order_refund_approved',
                'store_order_auto_completed',
                'community_chat',
                'trade_chat',
                'group_chat'
              )
            )
          ELSE false
        END
    );
  END IF;

  RETURN v_cnt::bigint;
END;
$$;

-- ---------------------------------------------------------------------------
-- B. Admin Realtime publication + tight Admin SELECT (wake-up only)
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RAISE NOTICE 'admin_rt: supabase_realtime publication missing — skip ADD TABLE';
    RETURN;
  END IF;

  IF to_regclass('public.store_point_charge_requests') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'store_point_charge_requests'
     ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.store_point_charge_requests';
  END IF;

  IF to_regclass('public.feed_ad_requests') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'feed_ad_requests'
     ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.feed_ad_requests';
  END IF;

  IF to_regclass('public.delivery_operation_alert_events') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'delivery_operation_alert_events'
     ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.delivery_operation_alert_events';
  END IF;
END $$;

-- Tight Admin SELECT for RT (authenticated + is_platform_admin only)
DROP POLICY IF EXISTS store_point_charge_requests_admin_select ON public.store_point_charge_requests;
CREATE POLICY store_point_charge_requests_admin_select
  ON public.store_point_charge_requests
  FOR SELECT
  TO authenticated
  USING (public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS feed_ad_requests_admin_select ON public.feed_ad_requests;
CREATE POLICY feed_ad_requests_admin_select
  ON public.feed_ad_requests
  FOR SELECT
  TO authenticated
  USING (public.is_platform_admin(auth.uid()));

-- delivery_operation_alert_events already has admin_all; keep SELECT eligible for RT

COMMIT;
