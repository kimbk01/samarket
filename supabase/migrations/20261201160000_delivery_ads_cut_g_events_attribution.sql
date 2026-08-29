-- CUT G — Delivery Ads impression / click / order attribution SSOT
-- Billing amounts OUT (CUT H). Analytics UI OUT (CUT I).
-- EXECUTE: service_role only from day one.

BEGIN;

-- ── Attribution policy (business window NOT_CONFIGURED → attribution fail-closed) ─
CREATE TABLE IF NOT EXISTS public.delivery_ad_attribution_policy (
  id text PRIMARY KEY DEFAULT 'default',
  model text NOT NULL DEFAULT 'LAST_ELIGIBLE_CLICK'
    CHECK (model IN ('LAST_ELIGIBLE_CLICK')),
  click_window_seconds integer NULL
    CHECK (click_window_seconds IS NULL OR click_window_seconds > 0),
  impression_only_enabled boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT false,
  notes text NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.delivery_ad_attribution_policy IS
  'CUT G attribution policy. When is_active=false or click_window_seconds NULL, Production attribution is fail-closed (NOT_CONFIGURED). No fake 7/14/30-day defaults.';

INSERT INTO public.delivery_ad_attribution_policy (id, model, click_window_seconds, impression_only_enabled, is_active, notes)
VALUES (
  'default',
  'LAST_ELIGIBLE_CLICK',
  NULL,
  false,
  false,
  'Business window not configured — attribution disabled until policy activated'
)
ON CONFLICT (id) DO NOTHING;

-- ── Impression events ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.delivery_ad_impression_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL,
  campaign_id uuid NOT NULL,
  product_kind text NOT NULL CHECK (product_kind IN ('store_sponsored', 'banner')),
  creative_id uuid NULL,
  inventory_id uuid NULL,
  store_id uuid NULL,
  surface text NOT NULL,
  placement_index integer NOT NULL DEFAULT 0,
  viewer_session_hash text NOT NULL,
  render_instance_id text NOT NULL,
  request_id text NULL,
  context_json jsonb NULL,
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT delivery_ad_impression_events_event_id_uidx UNIQUE (event_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS delivery_ad_impression_render_uidx
  ON public.delivery_ad_impression_events (
    render_instance_id,
    campaign_id,
    (coalesce(inventory_id, '00000000-0000-0000-0000-000000000000'::uuid))
  );

CREATE INDEX IF NOT EXISTS delivery_ad_impression_campaign_time_idx
  ON public.delivery_ad_impression_events (campaign_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS delivery_ad_impression_store_time_idx
  ON public.delivery_ad_impression_events (store_id, occurred_at DESC)
  WHERE store_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS delivery_ad_impression_inventory_time_idx
  ON public.delivery_ad_impression_events (inventory_id, occurred_at DESC)
  WHERE inventory_id IS NOT NULL;

COMMENT ON TABLE public.delivery_ad_impression_events IS
  'CUT G Delivery Ads impressions. No raw user_id or IP. Retention foundation only — no delete cron.';

-- ── Click events ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.delivery_ad_click_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL,
  impression_event_id uuid NULL REFERENCES public.delivery_ad_impression_events (id) ON DELETE SET NULL,
  campaign_id uuid NOT NULL,
  product_kind text NOT NULL CHECK (product_kind IN ('store_sponsored', 'banner')),
  creative_id uuid NULL,
  inventory_id uuid NULL,
  store_id uuid NOT NULL,
  surface text NOT NULL,
  placement_index integer NOT NULL DEFAULT 0,
  viewer_session_hash text NOT NULL,
  destination_type text NOT NULL
    CHECK (destination_type IN ('store_detail', 'store_menu', 'store_promotion')),
  destination_id uuid NOT NULL,
  attribution_bridge_key text NULL,
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT delivery_ad_click_events_event_id_uidx UNIQUE (event_id)
);

CREATE INDEX IF NOT EXISTS delivery_ad_click_store_session_time_idx
  ON public.delivery_ad_click_events (store_id, viewer_session_hash, occurred_at DESC);
CREATE INDEX IF NOT EXISTS delivery_ad_click_store_bridge_time_idx
  ON public.delivery_ad_click_events (store_id, attribution_bridge_key, occurred_at DESC)
  WHERE attribution_bridge_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS delivery_ad_click_campaign_time_idx
  ON public.delivery_ad_click_events (campaign_id, occurred_at DESC);

COMMENT ON TABLE public.delivery_ad_click_events IS
  'CUT G Delivery Ads clicks. attribution_bridge_key is server-only hash (not raw user id). Impression link preferred but optional when beacon lost.';

-- ── Order attributions ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.delivery_ad_order_attributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.store_orders (id) ON DELETE RESTRICT,
  campaign_id uuid NOT NULL,
  product_kind text NOT NULL CHECK (product_kind IN ('store_sponsored', 'banner')),
  creative_id uuid NULL,
  inventory_id uuid NULL,
  store_id uuid NOT NULL,
  impression_event_id uuid NULL REFERENCES public.delivery_ad_impression_events (id) ON DELETE SET NULL,
  click_event_id uuid NOT NULL REFERENCES public.delivery_ad_click_events (id) ON DELETE RESTRICT,
  attribution_model text NOT NULL DEFAULT 'LAST_ELIGIBLE_CLICK',
  attribution_status text NOT NULL DEFAULT 'ATTRIBUTED'
    CHECK (attribution_status IN ('ATTRIBUTED', 'ORDER_CANCELLED')),
  attribution_window_started_at timestamptz NULL,
  attribution_window_ends_at timestamptz NULL,
  attributed_at timestamptz NOT NULL DEFAULT now(),
  source_event_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT delivery_ad_order_attributions_order_uidx UNIQUE (order_id)
);

CREATE INDEX IF NOT EXISTS delivery_ad_attr_campaign_idx
  ON public.delivery_ad_order_attributions (campaign_id, attributed_at DESC);
CREATE INDEX IF NOT EXISTS delivery_ad_attr_store_idx
  ON public.delivery_ad_order_attributions (store_id, attributed_at DESC);

COMMENT ON TABLE public.delivery_ad_order_attributions IS
  'CUT G exactly-once order attribution (LAST_ELIGIBLE_CLICK). No charge/budget columns. Cancel does not delete history.';

-- ── RLS: no customer/owner raw event reads ──────────────────────────────────
ALTER TABLE public.delivery_ad_attribution_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_ad_impression_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_ad_click_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_ad_order_attributions ENABLE ROW LEVEL SECURITY;

-- No SELECT/INSERT/UPDATE/DELETE policies for anon/authenticated — service_role bypasses RLS.

-- ── Impression write RPC ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.delivery_ad_record_impression(
  p_event_id text,
  p_campaign_id uuid,
  p_product_kind text,
  p_creative_id uuid,
  p_inventory_id uuid,
  p_store_id uuid,
  p_surface text,
  p_placement_index integer,
  p_viewer_session_hash text,
  p_render_instance_id text,
  p_request_id text,
  p_occurred_at timestamptz,
  p_context_json jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF length(trim(coalesce(p_event_id, ''))) = 0
     OR p_campaign_id IS NULL
     OR p_product_kind NOT IN ('store_sponsored', 'banner')
     OR length(trim(coalesce(p_viewer_session_hash, ''))) = 0
     OR length(trim(coalesce(p_render_instance_id, ''))) = 0
     OR length(trim(coalesce(p_surface, ''))) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_payload');
  END IF;

  INSERT INTO public.delivery_ad_impression_events (
    event_id, campaign_id, product_kind, creative_id, inventory_id, store_id,
    surface, placement_index, viewer_session_hash, render_instance_id,
    request_id, context_json, occurred_at
  ) VALUES (
    p_event_id, p_campaign_id, p_product_kind, p_creative_id, p_inventory_id, p_store_id,
    p_surface, coalesce(p_placement_index, 0), p_viewer_session_hash, p_render_instance_id,
    p_request_id, p_context_json, coalesce(p_occurred_at, now())
  )
  ON CONFLICT (event_id) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM public.delivery_ad_impression_events WHERE event_id = p_event_id;
    RETURN jsonb_build_object('ok', true, 'deduped', true, 'id', v_id);
  END IF;

  RETURN jsonb_build_object('ok', true, 'deduped', false, 'id', v_id);
EXCEPTION
  WHEN unique_violation THEN
    SELECT id INTO v_id FROM public.delivery_ad_impression_events WHERE event_id = p_event_id;
    IF v_id IS NULL THEN
      SELECT id INTO v_id FROM public.delivery_ad_impression_events
      WHERE render_instance_id = p_render_instance_id AND campaign_id = p_campaign_id
      LIMIT 1;
    END IF;
    RETURN jsonb_build_object('ok', true, 'deduped', true, 'id', v_id);
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', 'db_error', 'detail', SQLERRM);
END;
$$;

-- ── Click write RPC ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.delivery_ad_record_click(
  p_event_id text,
  p_impression_event_id uuid,
  p_campaign_id uuid,
  p_product_kind text,
  p_creative_id uuid,
  p_inventory_id uuid,
  p_store_id uuid,
  p_surface text,
  p_placement_index integer,
  p_viewer_session_hash text,
  p_destination_type text,
  p_destination_id uuid,
  p_attribution_bridge_key text,
  p_occurred_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF length(trim(coalesce(p_event_id, ''))) = 0
     OR p_campaign_id IS NULL
     OR p_store_id IS NULL
     OR p_product_kind NOT IN ('store_sponsored', 'banner')
     OR p_destination_type NOT IN ('store_detail', 'store_menu', 'store_promotion')
     OR p_destination_id IS NULL
     OR length(trim(coalesce(p_viewer_session_hash, ''))) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_payload');
  END IF;

  INSERT INTO public.delivery_ad_click_events (
    event_id, impression_event_id, campaign_id, product_kind, creative_id, inventory_id,
    store_id, surface, placement_index, viewer_session_hash, destination_type, destination_id,
    attribution_bridge_key, occurred_at
  ) VALUES (
    p_event_id, p_impression_event_id, p_campaign_id, p_product_kind, p_creative_id, p_inventory_id,
    p_store_id, p_surface, coalesce(p_placement_index, 0), p_viewer_session_hash,
    p_destination_type, p_destination_id, nullif(trim(coalesce(p_attribution_bridge_key, '')), ''),
    coalesce(p_occurred_at, now())
  )
  ON CONFLICT (event_id) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM public.delivery_ad_click_events WHERE event_id = p_event_id;
    RETURN jsonb_build_object('ok', true, 'deduped', true, 'id', v_id);
  END IF;

  RETURN jsonb_build_object('ok', true, 'deduped', false, 'id', v_id);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', 'db_error', 'detail', SQLERRM);
END;
$$;

-- ── Attribution reconcile RPC (exactly-once per order) ──────────────────────
CREATE OR REPLACE FUNCTION public.delivery_ad_reconcile_order_attribution(
  p_order_id uuid,
  p_store_id uuid,
  p_attribution_bridge_key text,
  p_order_committed_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_policy record;
  v_existing uuid;
  v_click record;
  v_window_start timestamptz;
  v_attr_id uuid;
BEGIN
  IF p_order_id IS NULL OR p_store_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_payload');
  END IF;

  SELECT id INTO v_existing FROM public.delivery_ad_order_attributions WHERE order_id = p_order_id;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'deduped', true, 'id', v_existing);
  END IF;

  SELECT * INTO v_policy FROM public.delivery_ad_attribution_policy WHERE id = 'default';
  IF NOT FOUND OR v_policy.is_active IS NOT TRUE OR v_policy.click_window_seconds IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'attributed', false, 'reason', 'policy_not_configured');
  END IF;

  IF v_policy.impression_only_enabled IS NOT TRUE AND length(trim(coalesce(p_attribution_bridge_key, ''))) = 0 THEN
    RETURN jsonb_build_object('ok', true, 'attributed', false, 'reason', 'no_bridge_key');
  END IF;

  v_window_start := coalesce(p_order_committed_at, now()) - make_interval(secs => v_policy.click_window_seconds);

  SELECT c.* INTO v_click
  FROM public.delivery_ad_click_events c
  WHERE c.store_id = p_store_id
    AND c.attribution_bridge_key = p_attribution_bridge_key
    AND c.occurred_at < coalesce(p_order_committed_at, now())
    AND c.occurred_at >= v_window_start
  ORDER BY c.occurred_at DESC, c.id DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'attributed', false, 'reason', 'no_eligible_click');
  END IF;

  INSERT INTO public.delivery_ad_order_attributions (
    order_id, campaign_id, product_kind, creative_id, inventory_id, store_id,
    impression_event_id, click_event_id, attribution_model, attribution_status,
    attribution_window_started_at, attribution_window_ends_at, attributed_at, source_event_id
  ) VALUES (
    p_order_id, v_click.campaign_id, v_click.product_kind, v_click.creative_id, v_click.inventory_id, v_click.store_id,
    v_click.impression_event_id, v_click.id, v_policy.model, 'ATTRIBUTED',
    v_window_start, coalesce(p_order_committed_at, now()), now(), v_click.event_id
  )
  ON CONFLICT (order_id) DO NOTHING
  RETURNING id INTO v_attr_id;

  IF v_attr_id IS NULL THEN
    SELECT id INTO v_attr_id FROM public.delivery_ad_order_attributions WHERE order_id = p_order_id;
    RETURN jsonb_build_object('ok', true, 'deduped', true, 'id', v_attr_id);
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'attributed', true,
    'id', v_attr_id,
    'click_event_id', v_click.id,
    'campaign_id', v_click.campaign_id,
    'product_kind', v_click.product_kind
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', 'db_error', 'detail', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.delivery_ad_record_impression(text, uuid, text, uuid, uuid, uuid, text, integer, text, text, text, timestamptz, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delivery_ad_record_impression(text, uuid, text, uuid, uuid, uuid, text, integer, text, text, text, timestamptz, jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delivery_ad_record_impression(text, uuid, text, uuid, uuid, uuid, text, integer, text, text, text, timestamptz, jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.delivery_ad_record_click(text, uuid, uuid, text, uuid, uuid, uuid, text, integer, text, text, uuid, text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delivery_ad_record_click(text, uuid, uuid, text, uuid, uuid, uuid, text, integer, text, text, uuid, text, timestamptz) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delivery_ad_record_click(text, uuid, uuid, text, uuid, uuid, uuid, text, integer, text, text, uuid, text, timestamptz) TO service_role;

REVOKE ALL ON FUNCTION public.delivery_ad_reconcile_order_attribution(uuid, uuid, text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delivery_ad_reconcile_order_attribution(uuid, uuid, text, timestamptz) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delivery_ad_reconcile_order_attribution(uuid, uuid, text, timestamptz) TO service_role;

COMMIT;
