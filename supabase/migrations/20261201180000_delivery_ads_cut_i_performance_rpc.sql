-- CUT I — Delivery Ads performance aggregate RPCs (G/H evidence only).
-- No counter tables. No billing activation. service_role EXECUTE only.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_delivery_ad_performance(
  p_campaign_ids uuid[],
  p_range_start timestamptz,
  p_range_end timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_billing_enabled boolean := false;
  v_attr_configured boolean := false;
  v_totals jsonb;
  v_by_campaign jsonb;
BEGIN
  SELECT coalesce(is_enabled, false) INTO v_billing_enabled
  FROM public.delivery_ad_billing_policy WHERE id = 'default';

  SELECT (is_active IS TRUE AND click_window_seconds IS NOT NULL AND click_window_seconds > 0)
  INTO v_attr_configured
  FROM public.delivery_ad_attribution_policy WHERE id = 'default';

  -- Empty array = no campaigns in scope (not "all").
  IF p_campaign_ids IS NOT NULL AND cardinality(p_campaign_ids) = 0 THEN
    RETURN jsonb_build_object(
      'ok', true,
      'billing_enabled', v_billing_enabled,
      'attribution_configured', coalesce(v_attr_configured, false),
      'totals', jsonb_build_object(
        'impressions', 0, 'clicks', 0, 'attributed_orders', 0,
        'gross_spend_minor', 0, 'refunds_minor', 0
      ),
      'by_campaign', '[]'::jsonb
    );
  END IF;

  WITH scoped AS (
    SELECT unnest(p_campaign_ids) AS campaign_id
    WHERE p_campaign_ids IS NOT NULL
  ),
  imp AS (
    SELECT e.campaign_id, count(*)::bigint AS impressions
    FROM public.delivery_ad_impression_events e
    WHERE (p_campaign_ids IS NULL OR e.campaign_id IN (SELECT campaign_id FROM scoped))
      AND (p_range_start IS NULL OR e.occurred_at >= p_range_start)
      AND (p_range_end IS NULL OR e.occurred_at <= p_range_end)
    GROUP BY e.campaign_id
  ),
  clk AS (
    SELECT e.campaign_id, count(*)::bigint AS clicks
    FROM public.delivery_ad_click_events e
    WHERE (p_campaign_ids IS NULL OR e.campaign_id IN (SELECT campaign_id FROM scoped))
      AND (p_range_start IS NULL OR e.occurred_at >= p_range_start)
      AND (p_range_end IS NULL OR e.occurred_at <= p_range_end)
    GROUP BY e.campaign_id
  ),
  attr AS (
    SELECT a.campaign_id, count(*)::bigint AS attributed_orders
    FROM public.delivery_ad_order_attributions a
    WHERE a.attribution_status = 'ATTRIBUTED'
      AND (p_campaign_ids IS NULL OR a.campaign_id IN (SELECT campaign_id FROM scoped))
      AND (p_range_start IS NULL OR a.attributed_at >= p_range_start)
      AND (p_range_end IS NULL OR a.attributed_at <= p_range_end)
    GROUP BY a.campaign_id
  ),
  chg AS (
    SELECT c.campaign_id, coalesce(sum(c.amount_minor), 0)::bigint AS gross_spend_minor
    FROM public.delivery_ad_charge_ledger c
    WHERE (p_campaign_ids IS NULL OR c.campaign_id IN (SELECT campaign_id FROM scoped))
      AND (p_range_start IS NULL OR c.occurred_at >= p_range_start)
      AND (p_range_end IS NULL OR c.occurred_at <= p_range_end)
    GROUP BY c.campaign_id
  ),
  ref AS (
    SELECT r.campaign_id, coalesce(sum(r.amount_minor), 0)::bigint AS refunds_minor
    FROM public.delivery_ad_refund_ledger r
    WHERE (p_campaign_ids IS NULL OR r.campaign_id IN (SELECT campaign_id FROM scoped))
      AND (p_range_start IS NULL OR r.occurred_at >= p_range_start)
      AND (p_range_end IS NULL OR r.occurred_at <= p_range_end)
    GROUP BY r.campaign_id
  ),
  keys AS (
    SELECT campaign_id FROM imp
    UNION SELECT campaign_id FROM clk
    UNION SELECT campaign_id FROM attr
    UNION SELECT campaign_id FROM chg
    UNION SELECT campaign_id FROM ref
    UNION SELECT campaign_id FROM scoped
  ),
  per AS (
    SELECT
      k.campaign_id,
      coalesce(i.impressions, 0) AS impressions,
      coalesce(c.clicks, 0) AS clicks,
      coalesce(a.attributed_orders, 0) AS attributed_orders,
      coalesce(g.gross_spend_minor, 0) AS gross_spend_minor,
      coalesce(f.refunds_minor, 0) AS refunds_minor
    FROM keys k
    LEFT JOIN imp i ON i.campaign_id = k.campaign_id
    LEFT JOIN clk c ON c.campaign_id = k.campaign_id
    LEFT JOIN attr a ON a.campaign_id = k.campaign_id
    LEFT JOIN chg g ON g.campaign_id = k.campaign_id
    LEFT JOIN ref f ON f.campaign_id = k.campaign_id
  )
  SELECT
    coalesce(jsonb_agg(
      jsonb_build_object(
        'campaign_id', campaign_id,
        'impressions', impressions,
        'clicks', clicks,
        'attributed_orders', attributed_orders,
        'gross_spend_minor', gross_spend_minor,
        'refunds_minor', refunds_minor
      )
      ORDER BY campaign_id
    ), '[]'::jsonb),
    jsonb_build_object(
      'impressions', coalesce(sum(impressions), 0),
      'clicks', coalesce(sum(clicks), 0),
      'attributed_orders', coalesce(sum(attributed_orders), 0),
      'gross_spend_minor', coalesce(sum(gross_spend_minor), 0),
      'refunds_minor', coalesce(sum(refunds_minor), 0)
    )
  INTO v_by_campaign, v_totals
  FROM per;

  RETURN jsonb_build_object(
    'ok', true,
    'billing_enabled', coalesce(v_billing_enabled, false),
    'attribution_configured', coalesce(v_attr_configured, false),
    'totals', coalesce(v_totals, jsonb_build_object(
      'impressions', 0, 'clicks', 0, 'attributed_orders', 0,
      'gross_spend_minor', 0, 'refunds_minor', 0
    )),
    'by_campaign', coalesce(v_by_campaign, '[]'::jsonb)
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', 'db_error', 'detail', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_delivery_ad_performance_breakdown(
  p_campaign_ids uuid[],
  p_group_by text,
  p_range_start timestamptz,
  p_range_end timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_billing_enabled boolean := false;
  v_attr_configured boolean := false;
  v_rows jsonb;
BEGIN
  IF p_group_by NOT IN ('product', 'inventory', 'campaign', 'day') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_group_by');
  END IF;

  SELECT coalesce(is_enabled, false) INTO v_billing_enabled
  FROM public.delivery_ad_billing_policy WHERE id = 'default';

  SELECT (is_active IS TRUE AND click_window_seconds IS NOT NULL AND click_window_seconds > 0)
  INTO v_attr_configured
  FROM public.delivery_ad_attribution_policy WHERE id = 'default';

  IF p_campaign_ids IS NOT NULL AND cardinality(p_campaign_ids) = 0 THEN
    RETURN jsonb_build_object(
      'ok', true,
      'billing_enabled', v_billing_enabled,
      'attribution_configured', coalesce(v_attr_configured, false),
      'rows', '[]'::jsonb
    );
  END IF;

  WITH scoped AS (
    SELECT unnest(p_campaign_ids) AS campaign_id
    WHERE p_campaign_ids IS NOT NULL
  ),
  imp AS (
    SELECT
      CASE p_group_by
        WHEN 'product' THEN e.product_kind
        WHEN 'inventory' THEN coalesce(e.inventory_id::text, 'unknown')
        WHEN 'campaign' THEN e.campaign_id::text
        WHEN 'day' THEN to_char(e.occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD')
      END AS bucket_key,
      count(*)::bigint AS impressions
    FROM public.delivery_ad_impression_events e
    WHERE (p_campaign_ids IS NULL OR e.campaign_id IN (SELECT campaign_id FROM scoped))
      AND (p_range_start IS NULL OR e.occurred_at >= p_range_start)
      AND (p_range_end IS NULL OR e.occurred_at <= p_range_end)
    GROUP BY 1
  ),
  clk AS (
    SELECT
      CASE p_group_by
        WHEN 'product' THEN e.product_kind
        WHEN 'inventory' THEN coalesce(e.inventory_id::text, 'unknown')
        WHEN 'campaign' THEN e.campaign_id::text
        WHEN 'day' THEN to_char(e.occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD')
      END AS bucket_key,
      count(*)::bigint AS clicks
    FROM public.delivery_ad_click_events e
    WHERE (p_campaign_ids IS NULL OR e.campaign_id IN (SELECT campaign_id FROM scoped))
      AND (p_range_start IS NULL OR e.occurred_at >= p_range_start)
      AND (p_range_end IS NULL OR e.occurred_at <= p_range_end)
    GROUP BY 1
  ),
  attr AS (
    SELECT
      CASE p_group_by
        WHEN 'product' THEN a.product_kind
        WHEN 'inventory' THEN coalesce(a.inventory_id::text, 'unknown')
        WHEN 'campaign' THEN a.campaign_id::text
        WHEN 'day' THEN to_char(a.attributed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD')
      END AS bucket_key,
      count(*)::bigint AS attributed_orders
    FROM public.delivery_ad_order_attributions a
    WHERE a.attribution_status = 'ATTRIBUTED'
      AND (p_campaign_ids IS NULL OR a.campaign_id IN (SELECT campaign_id FROM scoped))
      AND (p_range_start IS NULL OR a.attributed_at >= p_range_start)
      AND (p_range_end IS NULL OR a.attributed_at <= p_range_end)
    GROUP BY 1
  ),
  chg AS (
    SELECT
      CASE p_group_by
        WHEN 'product' THEN c.product_kind
        WHEN 'inventory' THEN 'n/a'
        WHEN 'campaign' THEN c.campaign_id::text
        WHEN 'day' THEN to_char(c.occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD')
      END AS bucket_key,
      coalesce(sum(c.amount_minor), 0)::bigint AS gross_spend_minor
    FROM public.delivery_ad_charge_ledger c
    WHERE (p_campaign_ids IS NULL OR c.campaign_id IN (SELECT campaign_id FROM scoped))
      AND (p_range_start IS NULL OR c.occurred_at >= p_range_start)
      AND (p_range_end IS NULL OR c.occurred_at <= p_range_end)
    GROUP BY 1
  ),
  ref AS (
    SELECT
      CASE p_group_by
        WHEN 'product' THEN (
          SELECT c.product_kind FROM public.delivery_ad_charge_ledger c
          WHERE c.id = r.original_charge_id LIMIT 1
        )
        WHEN 'inventory' THEN 'n/a'
        WHEN 'campaign' THEN r.campaign_id::text
        WHEN 'day' THEN to_char(r.occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD')
      END AS bucket_key,
      coalesce(sum(r.amount_minor), 0)::bigint AS refunds_minor
    FROM public.delivery_ad_refund_ledger r
    WHERE (p_campaign_ids IS NULL OR r.campaign_id IN (SELECT campaign_id FROM scoped))
      AND (p_range_start IS NULL OR r.occurred_at >= p_range_start)
      AND (p_range_end IS NULL OR r.occurred_at <= p_range_end)
    GROUP BY 1
  ),
  keys AS (
    SELECT bucket_key FROM imp WHERE bucket_key IS NOT NULL
    UNION SELECT bucket_key FROM clk WHERE bucket_key IS NOT NULL
    UNION SELECT bucket_key FROM attr WHERE bucket_key IS NOT NULL
    UNION SELECT bucket_key FROM chg WHERE bucket_key IS NOT NULL
    UNION SELECT bucket_key FROM ref WHERE bucket_key IS NOT NULL
  )
  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'bucket_key', k.bucket_key,
      'impressions', coalesce(i.impressions, 0),
      'clicks', coalesce(c.clicks, 0),
      'attributed_orders', coalesce(a.attributed_orders, 0),
      'gross_spend_minor', coalesce(g.gross_spend_minor, 0),
      'refunds_minor', coalesce(f.refunds_minor, 0)
    )
    ORDER BY k.bucket_key
  ), '[]'::jsonb)
  INTO v_rows
  FROM keys k
  LEFT JOIN imp i ON i.bucket_key = k.bucket_key
  LEFT JOIN clk c ON c.bucket_key = k.bucket_key
  LEFT JOIN attr a ON a.bucket_key = k.bucket_key
  LEFT JOIN chg g ON g.bucket_key = k.bucket_key
  LEFT JOIN ref f ON f.bucket_key = k.bucket_key;

  RETURN jsonb_build_object(
    'ok', true,
    'billing_enabled', coalesce(v_billing_enabled, false),
    'attribution_configured', coalesce(v_attr_configured, false),
    'rows', coalesce(v_rows, '[]'::jsonb)
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', 'db_error', 'detail', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.get_delivery_ad_performance(uuid[], timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_delivery_ad_performance(uuid[], timestamptz, timestamptz) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_delivery_ad_performance(uuid[], timestamptz, timestamptz) TO service_role;

REVOKE ALL ON FUNCTION public.get_delivery_ad_performance_breakdown(uuid[], text, timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_delivery_ad_performance_breakdown(uuid[], text, timestamptz, timestamptz) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_delivery_ad_performance_breakdown(uuid[], text, timestamptz, timestamptz) TO service_role;

COMMIT;
