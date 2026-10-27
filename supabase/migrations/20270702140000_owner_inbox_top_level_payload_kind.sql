-- FAIL② (실기기 V1, docs/audit/notification-system-full-audit-2026-10-27.md)
-- legacy backfill 오너 행(store_point_deducted 등 393건)은 kind·store_id·targetRoute 가 display_payload
-- 최상위에만 있고 legacyMeta 가 없다. 20270702120000 은 legacyMeta 만 읽어 이 행들을 오너 인박스에서 빠뜨렸다.
-- 종류·매장·링크·meta 를 legacyMeta → 최상위 순서로 읽도록 두 함수를 교체한다. 출력 형태는 그대로.
-- Rollback: 20270702120000_owner_inbox_read_notification_events.sql 의 두 함수 재적용.

BEGIN;

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
        'link_url', coalesce(e.display_payload->>'routeUrl', e.display_payload->>'targetRoute'),
        'is_read', (e.unread = false OR e.read_at IS NOT NULL),
        'created_at', e.created_at,
        'meta', coalesce(e.display_payload->'legacyMeta', e.display_payload - 'deleted_at' - 'inbox_dismissed_at', '{}'::jsonb)
      )
      ORDER BY e.created_at DESC
    ),
    '[]'::jsonb
  )
  FROM (
    SELECT ne.*
    FROM public.notification_events AS ne
    WHERE ne.user_id = p_user_id
      AND coalesce(ne.display_payload->'legacyMeta'->>'kind', ne.display_payload->>'kind') = ANY (public.owner_store_commerce_notification_kinds())
      AND trim(coalesce(ne.display_payload->'legacyMeta'->>'store_id', ne.display_payload->>'store_id', '')) = p_store_id::text
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
      AND coalesce(ne.display_payload->'legacyMeta'->>'kind', ne.display_payload->>'kind') = ANY (public.owner_store_commerce_notification_kinds())
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
      AND trim(coalesce(o.display_payload->'legacyMeta'->>'store_id', o.display_payload->>'store_id', '')) = p_store_id::text
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
          'link_url', coalesce(sf.display_payload->>'routeUrl', sf.display_payload->>'targetRoute'),
          'is_read', (sf.unread = false OR sf.read_at IS NOT NULL),
          'created_at', sf.created_at,
          'meta', coalesce(sf.display_payload->'legacyMeta', sf.display_payload - 'deleted_at' - 'inbox_dismissed_at', '{}'::jsonb)
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
