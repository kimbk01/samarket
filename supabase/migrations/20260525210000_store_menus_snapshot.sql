-- Store menus public API: single-RPC snapshot (1 PostgREST RTT cold path).
-- Semantics aligned with fetchStoreMenusCatalog (products + popular + meta).

CREATE TABLE IF NOT EXISTS public.store_menus_snapshots (
  store_slug text NOT NULL,
  viewer_user_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'::uuid,
  menu_version text NOT NULL DEFAULT 'default',
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (store_slug, viewer_user_id, menu_version)
);

COMMENT ON TABLE public.store_menus_snapshots IS
  'Precomputed store menus payload (store + products + popular stats + meta). Event-driven refresh; read path 1 PK select.';

CREATE INDEX IF NOT EXISTS idx_store_menus_snapshots_updated
  ON public.store_menus_snapshots (updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_store_menus_snapshots_slug
  ON public.store_menus_snapshots (store_slug);

ALTER TABLE public.store_menus_snapshots ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.get_store_menus_snapshot(
  p_store_slug text,
  p_user_id uuid DEFAULT NULL,
  p_menu_version text DEFAULT 'default'
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH slug AS (
    SELECT lower(trim(coalesce(p_store_slug, ''))) AS s
  ),
  store_row AS (
    SELECT st.id, st.slug, st.store_name, st.menu_sold_out_bottom
    FROM public.stores st, slug
    WHERE lower(trim(st.slug)) = slug.s
      AND st.approval_status = 'approved'
      AND st.is_visible = true
    LIMIT 1
  ),
  commerce_raw AS (
    SELECT coalesce(
      jsonb_object_agg(a.key, a.value_json) FILTER (WHERE a.key IS NOT NULL),
      '{}'::jsonb
    ) AS settings
    FROM public.admin_settings a
    WHERE a.key IN (
      'popular_menu_window_days',
      'popular_menu_min_qty',
      'popular_menu_top_n',
      'popular_menu_recommended_max'
    )
  ),
  commerce AS (
    SELECT
      greatest(1, least(365, coalesce((commerce_raw.settings->'popular_menu_window_days'->>'value')::int, 30))) AS window_days,
      greatest(1, least(10000, coalesce((commerce_raw.settings->'popular_menu_min_qty'->>'value')::int, 1))) AS min_qty,
      greatest(1, least(50, coalesce((commerce_raw.settings->'popular_menu_top_n'->>'value')::int, 5))) AS top_n,
      greatest(0, least(30, coalesce((commerce_raw.settings->'popular_menu_recommended_max'->>'value')::int, 10))) AS recommended_max
    FROM commerce_raw
  ),
  since_ts AS (
    SELECT (now() - ((SELECT window_days FROM commerce) || ' days')::interval) AS t
  ),
  product_rows AS (
    SELECT
      p.id,
      p.title,
      p.summary,
      p.price,
      p.discount_price,
      p.discount_percent,
      p.stock_qty,
      p.track_inventory,
      p.min_order_qty,
      p.max_order_qty,
      p.product_status,
      p.thumbnail_url,
      p.pickup_available,
      p.local_delivery_available,
      p.shipping_available,
      p.menu_section_id,
      p.item_type,
      p.is_featured,
      p.is_owner_recommended,
      p.is_representative,
      p.sort_order,
      p.has_options,
      CASE
        WHEN ms.id IS NOT NULL THEN jsonb_build_object(
          'id', ms.id,
          'name', ms.name,
          'sort_order', ms.sort_order,
          'is_hidden', ms.is_hidden
        )
        ELSE NULL
      END AS store_menu_sections
    FROM public.store_products p
    LEFT JOIN public.store_menu_sections ms ON ms.id = p.menu_section_id
    WHERE p.store_id = (SELECT id FROM store_row)
      AND p.product_status IN ('active', 'sold_out')
    ORDER BY p.sort_order ASC NULLS LAST, p.id ASC
    LIMIT 120
  ),
  products_arr AS (
    SELECT coalesce(jsonb_agg(to_jsonb(pr) ORDER BY pr.sort_order ASC NULLS LAST, pr.id ASC), '[]'::jsonb) AS products
    FROM product_rows pr
  ),
  popular_rows AS (
    SELECT ps.product_id, ps.total_qty, ps.last_ordered_at
    FROM store_row sr
    CROSS JOIN commerce c
    CROSS JOIN since_ts st
    CROSS JOIN LATERAL public.get_store_popular_product_stats(sr.id, st.t, c.top_n) ps
  ),
  popular_arr AS (
    SELECT coalesce(
      jsonb_agg(
        jsonb_build_object(
          'product_id', pr.product_id,
          'total_qty', pr.total_qty,
          'last_ordered_at', pr.last_ordered_at
        )
      ),
      '[]'::jsonb
    ) AS popular_stats
    FROM popular_rows pr
  ),
  since90 AS (
    SELECT (now() - interval '90 days') AS t
  ),
  meta_row AS (
    SELECT
      coalesce((SELECT count(*)::int FROM public.store_favorites sf WHERE sf.store_id = sr.id), 0) AS favorite_count,
      coalesce((
        SELECT count(*)::int
        FROM public.store_orders so
        WHERE so.store_id = sr.id
          AND so.created_at >= (SELECT t FROM since90)
          AND so.order_status IN (
            'pending', 'accepted', 'preparing', 'ready_for_pickup',
            'delivering', 'arrived', 'completed', 'refund_requested'
          )
      ), 0) AS recent_order_count,
      CASE
        WHEN p_user_id IS NULL THEN false
        ELSE EXISTS (
          SELECT 1 FROM public.store_favorites vf
          WHERE vf.store_id = sr.id AND vf.user_id = p_user_id
        )
      END AS viewer_favorited,
      coalesce(
        (
          SELECT sp.allowed_to_sell = true AND sp.sales_status = 'approved'
          FROM public.store_sales_permissions sp
          WHERE sp.store_id = sr.id
          LIMIT 1
        ),
        false
      ) AS can_sell
    FROM store_row sr
  )
  SELECT CASE
    WHEN NOT EXISTS (SELECT 1 FROM store_row) THEN NULL::jsonb
    ELSE jsonb_build_object(
      'store', (
        SELECT jsonb_build_object(
          'id', sr.id,
          'slug', sr.slug,
          'store_name', sr.store_name,
          'menu_sold_out_bottom', coalesce(sr.menu_sold_out_bottom, false)
        )
        FROM store_row sr
      ),
      'products', (SELECT products FROM products_arr),
      'popular_stats', (SELECT popular_stats FROM popular_arr),
      'commerce', (
        SELECT jsonb_build_object(
          'popular_menu_window_days', c.window_days,
          'popular_menu_min_qty', c.min_qty,
          'popular_menu_top_n', c.top_n,
          'popular_menu_recommended_max', c.recommended_max
        )
        FROM commerce c
      ),
      'meta', (
        SELECT jsonb_build_object(
          'favorite_count', m.favorite_count,
          'recent_order_count', m.recent_order_count,
          'viewer_favorited', m.viewer_favorited,
          'can_sell', m.can_sell
        )
        FROM meta_row m
      ),
      'menu_version', coalesce(nullif(trim(p_menu_version), ''), 'default'),
      'updated_at', now()
    )
  END;
$$;

COMMENT ON FUNCTION public.get_store_menus_snapshot(text, uuid, text) IS
  'Store menus cold path — store + products (section join) + popular stats + meta in one SQL snapshot.';

REVOKE ALL ON FUNCTION public.get_store_menus_snapshot(text, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_store_menus_snapshot(text, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.get_store_menus_snapshot(text, uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_store_menus_snapshot(text, uuid, text) TO service_role;
