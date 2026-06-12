-- ASO1: GET /api/admin/store-orders — request-time aggregate → single RPC (NHR1 DANGER).

CREATE OR REPLACE FUNCTION public.admin_store_orders_buyer_label(
  p_display_name text,
  p_nickname text,
  p_username text,
  p_user_id uuid
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT coalesce(
    nullif(trim(p_display_name), ''),
    nullif(trim(p_nickname), ''),
    nullif(trim(p_username), ''),
    left(p_user_id::text, 8)
  );
$$;

CREATE OR REPLACE FUNCTION public.get_admin_store_orders_list_snapshot(
  p_order_id uuid DEFAULT NULL,
  p_order_no text DEFAULT '',
  p_store_id uuid DEFAULT NULL,
  p_buyer_user_id uuid DEFAULT NULL,
  p_payment_status text DEFAULT '',
  p_order_status text DEFAULT '',
  p_limit integer DEFAULT 500,
  p_include_items boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit integer := greatest(1, least(coalesce(p_limit, 500), 2000));
  v_order_no text := coalesce(trim(p_order_no), '');
BEGIN
  RETURN (
    WITH filtered AS (
      SELECT o.*
      FROM public.store_orders o
      WHERE (p_order_id IS NULL OR o.id = p_order_id)
        AND (v_order_no = '' OR o.order_no ILIKE '%' || v_order_no || '%')
        AND (p_store_id IS NULL OR o.store_id = p_store_id)
        AND (p_buyer_user_id IS NULL OR o.buyer_user_id = p_buyer_user_id)
        AND (coalesce(trim(p_payment_status), '') = '' OR o.payment_status = trim(p_payment_status))
        AND (coalesce(trim(p_order_status), '') = '' OR o.order_status = trim(p_order_status))
      ORDER BY o.created_at DESC
      LIMIT v_limit
    ),
    items_agg AS (
      SELECT
        i.order_id,
        coalesce(
          jsonb_agg(
            jsonb_build_object(
              'id', i.id,
              'order_id', i.order_id,
              'product_title_snapshot', i.product_title_snapshot,
              'price_snapshot', i.price_snapshot,
              'qty', i.qty,
              'subtotal', i.subtotal,
              'options_snapshot_json', i.options_snapshot_json
            )
            ORDER BY i.id
          ),
          '[]'::jsonb
        ) AS items
      FROM public.store_order_items i
      WHERE p_include_items
        AND i.order_id IN (SELECT id FROM filtered)
      GROUP BY i.order_id
    ),
    enriched AS (
      SELECT
        f.*,
        s.store_name,
        s.slug AS store_slug,
        s.owner_user_id AS store_owner_user_id,
        public.admin_store_orders_buyer_label(
          bt.display_name,
          coalesce(bp.nickname, bt.username),
          coalesce(bp.username, bt.username),
          f.buyer_user_id
        ) AS buyer_display_name,
        public.admin_store_orders_buyer_label(
          ot.display_name,
          coalesce(op.nickname, ot.username),
          coalesce(op.username, ot.username),
          s.owner_user_id
        ) AS store_owner_name,
        CASE WHEN p_include_items THEN coalesce(ia.items, '[]'::jsonb) ELSE NULL END AS items
      FROM filtered f
      LEFT JOIN public.stores s ON s.id = f.store_id
      LEFT JOIN public.profiles bp ON bp.id = f.buyer_user_id
      LEFT JOIN public.test_users bt ON bt.id = f.buyer_user_id
      LEFT JOIN public.profiles op ON op.id = s.owner_user_id
      LEFT JOIN public.test_users ot ON ot.id = s.owner_user_id
      LEFT JOIN items_agg ia ON ia.order_id = f.id
    )
    SELECT jsonb_build_object(
      'ok', true,
      'orders', coalesce(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'order', to_jsonb(e) - 'store_name' - 'store_slug' - 'store_owner_user_id'
                - 'buyer_display_name' - 'store_owner_name' - 'items',
              'store_name', coalesce(e.store_name, ''),
              'store_slug', coalesce(e.store_slug, ''),
              'store_owner_user_id', e.store_owner_user_id,
              'buyer_display_name', coalesce(e.buyer_display_name, left(e.buyer_user_id::text, 8)),
              'store_owner_name', coalesce(e.store_owner_name, '—'),
              'items', CASE WHEN p_include_items THEN coalesce(e.items, '[]'::jsonb) ELSE NULL END
            )
            ORDER BY e.created_at DESC
          )
          FROM enriched e
        ),
        '[]'::jsonb
      ),
      'updated_at', now()
    )
  );
END;
$$;

COMMENT ON FUNCTION public.admin_store_orders_buyer_label(text, text, text, uuid) IS
  'ASO1 helper — buyer/owner display label (internal).';

REVOKE ALL ON FUNCTION public.admin_store_orders_buyer_label(text, text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_store_orders_buyer_label(text, text, text, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.admin_store_orders_buyer_label(text, text, text, uuid) FROM authenticated;

COMMENT ON FUNCTION public.get_admin_store_orders_list_snapshot(uuid, text, uuid, uuid, text, text, integer, boolean) IS
  'ASO1 admin store orders list — orders + store + buyer/owner labels (+ optional items) single round-trip.';

REVOKE ALL ON FUNCTION public.get_admin_store_orders_list_snapshot(uuid, text, uuid, uuid, text, text, integer, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_admin_store_orders_list_snapshot(uuid, text, uuid, uuid, text, text, integer, boolean) FROM anon;
REVOKE ALL ON FUNCTION public.get_admin_store_orders_list_snapshot(uuid, text, uuid, uuid, text, text, integer, boolean) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_store_orders_list_snapshot(uuid, text, uuid, uuid, text, text, integer, boolean) TO service_role;
