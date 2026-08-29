-- CUT J — Activate STORES_SEARCH_TOP only.
-- STORE_DETAIL_RECOMMENDATION_BANNER stays FUTURE (no canonical recommendation ad surface).
-- Expand banner campaign surface CHECK for stores_search.
-- Update Owner banner upsert RPC to accept active SEARCH inventory.

BEGIN;

-- ── Inventory activation (canonical row; no silent campaign backfill) ───────
UPDATE public.delivery_ad_inventories
SET
  is_active = true,
  runtime_status = 'ACTIVE',
  ratio_source = 'PRODUCT_DESIGN_LOCK',
  updated_at = now()
WHERE key = 'STORES_SEARCH_TOP';

-- Explicit: DETAIL remains FUTURE / inactive
UPDATE public.delivery_ad_inventories
SET
  is_active = false,
  runtime_status = 'FUTURE',
  updated_at = now()
WHERE key = 'STORE_DETAIL_RECOMMENDATION_BANNER';

COMMENT ON TABLE public.delivery_ad_inventories IS
  'CUT B inventory SSOT. CUT J: STORES_SEARCH_TOP ACTIVE; STORE_DETAIL_RECOMMENDATION_BANNER FUTURE (no canonical recommendation ad surface).';

-- ── Banner surface CHECK: allow stores_search ────────────────────────────────
ALTER TABLE public.store_banner_ad_campaigns
  DROP CONSTRAINT IF EXISTS store_banner_ad_campaigns_surface_check;

ALTER TABLE public.store_banner_ad_campaigns
  ADD CONSTRAINT store_banner_ad_campaigns_surface_check
  CHECK (surface IN ('stores_home_hero', 'stores_search'));

COMMENT ON CONSTRAINT store_banner_ad_campaigns_surface_check ON public.store_banner_ad_campaigns IS
  'CUT J: stores_home_hero (HERO) + stores_search (STORES_SEARCH_TOP). No detail surface.';

-- ── Owner upsert: allow STORES_SEARCH_TOP + write surface from inventory ─────
CREATE OR REPLACE FUNCTION public.owner_delivery_banner_upsert(
  p_owner_user_id uuid,
  p_store_id uuid,
  p_campaign_id uuid,
  p_inventory_key text,
  p_asset_path text,
  p_source_width integer,
  p_source_height integer,
  p_source_aspect_ratio text,
  p_headline text,
  p_subcopy text,
  p_cta_type text,
  p_cta_target_id uuid,
  p_cta_label text,
  p_cta_href text,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_client_request_id text,
  p_supersede_creative_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv_id uuid;
  v_creative_id uuid;
  v_campaign_id uuid;
  v_version integer := 1;
  v_existing record;
  v_lifecycle text;
  v_review text;
  v_surface text;
BEGIN
  IF p_owner_user_id IS NULL OR p_store_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.stores s
    WHERE s.id = p_store_id
      AND s.owner_user_id = p_owner_user_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF p_inventory_key NOT IN ('STORES_HOME_HERO', 'STORES_SEARCH_TOP') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_inventory');
  END IF;

  SELECT i.id INTO v_inv_id
  FROM public.delivery_ad_inventories i
  WHERE i.key = p_inventory_key
    AND i.is_active = true
    AND i.runtime_status = 'ACTIVE'
  LIMIT 1;
  IF v_inv_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'inventory_lookup_failed');
  END IF;

  v_surface := CASE p_inventory_key
    WHEN 'STORES_SEARCH_TOP' THEN 'stores_search'
    ELSE 'stores_home_hero'
  END;

  IF length(trim(coalesce(p_asset_path, ''))) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'empty_asset_path');
  END IF;

  IF p_cta_type IS NULL OR p_cta_type NOT IN ('store_detail', 'store_menu', 'store_promotion') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_cta_type');
  END IF;

  IF p_cta_target_id IS NULL OR p_cta_target_id <> p_store_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_cta_target');
  END IF;

  IF p_end_at <= p_start_at THEN
    RETURN jsonb_build_object('ok', false, 'error', 'end_before_start');
  END IF;

  IF p_campaign_id IS NULL AND p_client_request_id IS NOT NULL THEN
    SELECT id INTO v_campaign_id
    FROM public.store_banner_ad_campaigns
    WHERE owner_user_id = p_owner_user_id
      AND owner_client_request_id = p_client_request_id
    LIMIT 1;
    IF v_campaign_id IS NOT NULL THEN
      RETURN jsonb_build_object('ok', true, 'campaign_id', v_campaign_id, 'idempotent', true);
    END IF;
  END IF;

  IF p_campaign_id IS NOT NULL THEN
    SELECT * INTO v_existing
    FROM public.store_banner_ad_campaigns
    WHERE id = p_campaign_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'campaign_not_found');
    END IF;
    IF v_existing.owner_user_id IS DISTINCT FROM p_owner_user_id
       OR v_existing.store_id IS DISTINCT FROM p_store_id THEN
      RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
    END IF;
    IF v_existing.lifecycle_status NOT IN ('DRAFT', 'CHANGES_REQUESTED') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'not_editable');
    END IF;
    v_campaign_id := v_existing.id;
    v_lifecycle := v_existing.lifecycle_status;
    v_review := v_existing.review_status;
  ELSE
    v_lifecycle := 'DRAFT';
    v_review := 'NOT_SUBMITTED';
  END IF;

  IF p_supersede_creative_id IS NOT NULL THEN
    SELECT coalesce(version, 1) + 1 INTO v_version
    FROM public.delivery_ad_creatives
    WHERE id = p_supersede_creative_id
      AND store_id = p_store_id
      AND product_kind = 'banner';
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'creative_not_found');
    END IF;
  END IF;

  INSERT INTO public.delivery_ad_creatives (
    product_kind, owner_id, store_id, asset_path,
    source_width, source_height, source_aspect_ratio,
    headline, subcopy, cta_type, cta_target_id, cta_label,
    review_status, version, supersedes_creative_id, created_by
  ) VALUES (
    'banner', p_owner_user_id, p_store_id, trim(p_asset_path),
    p_source_width, p_source_height, p_source_aspect_ratio,
    nullif(trim(coalesce(p_headline, '')), ''),
    nullif(trim(coalesce(p_subcopy, '')), ''),
    p_cta_type, p_cta_target_id, nullif(trim(coalesce(p_cta_label, '')), ''),
    'NOT_SUBMITTED', v_version, p_supersede_creative_id, p_owner_user_id
  )
  RETURNING id INTO v_creative_id;

  IF v_campaign_id IS NULL THEN
    INSERT INTO public.store_banner_ad_campaigns (
      surface, title, subtitle, image_url, cta_href, sort_order,
      start_at, end_at, is_active,
      product_key, owner_user_id, store_id, creative_id,
      lifecycle_status, review_status, pricing_model,
      owner_client_request_id, created_by_user_id, updated_by_user_id
    ) VALUES (
      v_surface,
      nullif(trim(coalesce(p_headline, '')), ''),
      nullif(trim(coalesce(p_subcopy, '')), ''),
      trim(p_asset_path),
      coalesce(p_cta_href, ''),
      0,
      p_start_at, p_end_at, false,
      'banner', p_owner_user_id, p_store_id, v_creative_id,
      'DRAFT', 'NOT_SUBMITTED', NULL,
      nullif(trim(coalesce(p_client_request_id, '')), ''),
      p_owner_user_id, p_owner_user_id
    )
    RETURNING id INTO v_campaign_id;
  ELSE
    UPDATE public.store_banner_ad_campaigns SET
      surface = v_surface,
      title = nullif(trim(coalesce(p_headline, '')), ''),
      subtitle = nullif(trim(coalesce(p_subcopy, '')), ''),
      image_url = trim(p_asset_path),
      cta_href = coalesce(p_cta_href, ''),
      start_at = p_start_at,
      end_at = p_end_at,
      creative_id = v_creative_id,
      is_active = false,
      lifecycle_status = v_lifecycle,
      review_status = CASE
        WHEN v_lifecycle = 'CHANGES_REQUESTED' THEN 'CHANGES_REQUESTED'
        ELSE 'NOT_SUBMITTED'
      END,
      updated_by_user_id = p_owner_user_id,
      updated_at = now()
    WHERE id = v_campaign_id;
  END IF;

  DELETE FROM public.delivery_banner_campaign_inventories
  WHERE campaign_id = v_campaign_id;

  INSERT INTO public.delivery_banner_campaign_inventories (campaign_id, inventory_id, priority)
  VALUES (v_campaign_id, v_inv_id, 0);

  INSERT INTO public.delivery_ad_audit_logs (
    product_kind, campaign_id, actor_type, actor_user_id, action, after_json
  ) VALUES (
    'banner', v_campaign_id, 'owner', p_owner_user_id,
    CASE WHEN p_campaign_id IS NULL THEN 'owner_banner_create_draft' ELSE 'owner_banner_update_draft' END,
    jsonb_build_object(
      'creative_id', v_creative_id,
      'inventory_key', p_inventory_key,
      'surface', v_surface,
      'lifecycle', v_lifecycle
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'campaign_id', v_campaign_id,
    'creative_id', v_creative_id,
    'idempotent', false
  );
EXCEPTION
  WHEN unique_violation THEN
    IF p_client_request_id IS NOT NULL THEN
      SELECT id INTO v_campaign_id
      FROM public.store_banner_ad_campaigns
      WHERE owner_user_id = p_owner_user_id
        AND owner_client_request_id = p_client_request_id
      LIMIT 1;
      IF v_campaign_id IS NOT NULL THEN
        RETURN jsonb_build_object('ok', true, 'campaign_id', v_campaign_id, 'idempotent', true);
      END IF;
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'duplicate_submit');
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', 'db_error', 'detail', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.owner_delivery_banner_upsert(
  uuid, uuid, uuid, text, text, integer, integer, text, text, text, text, uuid, text, text, timestamptz, timestamptz, text, uuid
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.owner_delivery_banner_upsert(
  uuid, uuid, uuid, text, text, integer, integer, text, text, text, text, uuid, text, text, timestamptz, timestamptz, text, uuid
) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.owner_delivery_banner_upsert(
  uuid, uuid, uuid, text, text, integer, integer, text, text, text, text, uuid, text, text, timestamptz, timestamptz, text, uuid
) TO service_role;

COMMIT;
