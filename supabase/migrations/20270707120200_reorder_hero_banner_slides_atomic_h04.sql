-- H-04 (2026-10-28 delivery audit §F) — HERO slide order saved atomically.
-- Before: one UPDATE per row from TS (partial failure = mixed order), any campaign id accepted,
-- and campaigns not in the request kept stale sort_order values that tied with the new 0..n-1.
-- Now: one transaction, every id must be a stores_home_hero campaign, listed ids get 0..n-1 and
-- every other HERO campaign is renumbered after them in its previous order (no ties).

CREATE OR REPLACE FUNCTION public.reorder_store_banner_hero_slides(
  p_admin_user_id uuid,
  p_ordered_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_n integer;
  v_found integer;
  v_before jsonb;
BEGIN
  IF p_admin_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_actor');
  END IF;
  v_n := coalesce(array_length(p_ordered_ids, 1), 0);
  IF v_n = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'empty_order');
  END IF;
  IF (SELECT count(DISTINCT x) FROM unnest(p_ordered_ids) x) <> v_n THEN
    RETURN jsonb_build_object('ok', false, 'error', 'duplicate_ids');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('store_banner_ad_campaigns.sort_order:stores_home_hero'));

  PERFORM 1 FROM public.store_banner_ad_campaigns
  WHERE surface = 'stores_home_hero'
  FOR UPDATE;

  SELECT count(*) INTO v_found
  FROM public.store_banner_ad_campaigns
  WHERE id = ANY (p_ordered_ids) AND surface = 'stores_home_hero';
  IF v_found <> v_n THEN
    RETURN jsonb_build_object('ok', false, 'error', 'campaign_not_hero');
  END IF;

  SELECT jsonb_agg(jsonb_build_object('id', id, 'sort_order', sort_order) ORDER BY sort_order, id)
    INTO v_before
  FROM public.store_banner_ad_campaigns
  WHERE surface = 'stores_home_hero';

  WITH listed AS (
    SELECT x.id, x.ord - 1 AS new_order
    FROM unnest(p_ordered_ids) WITH ORDINALITY AS x(id, ord)
  ),
  rest AS (
    SELECT c.id,
           v_n - 1 + row_number() OVER (ORDER BY c.sort_order, c.start_at DESC NULLS LAST, c.id) AS new_order
    FROM public.store_banner_ad_campaigns c
    WHERE c.surface = 'stores_home_hero'
      AND NOT (c.id = ANY (p_ordered_ids))
  ),
  target AS (
    SELECT id, new_order FROM listed
    UNION ALL
    SELECT id, new_order FROM rest
  )
  UPDATE public.store_banner_ad_campaigns c
  SET sort_order = t.new_order,
      updated_by_user_id = p_admin_user_id,
      updated_at = now()
  FROM target t
  WHERE c.id = t.id AND c.sort_order IS DISTINCT FROM t.new_order;

  INSERT INTO public.delivery_ad_audit_logs (
    product_kind, campaign_id, actor_type, actor_user_id, action, before_json, after_json, reason
  ) VALUES (
    'banner', p_ordered_ids[1], 'admin', p_admin_user_id, 'reorder_slides',
    jsonb_build_object('slides', v_before),
    jsonb_build_object('orderedCampaignIds', to_jsonb(p_ordered_ids), 'placement', 'STORES_HOME_HERO'),
    NULL
  );

  RETURN jsonb_build_object('ok', true, 'orderedIds', to_jsonb(p_ordered_ids));
END;
$function$;

REVOKE ALL ON FUNCTION public.reorder_store_banner_hero_slides(uuid, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reorder_store_banner_hero_slides(uuid, uuid[]) TO service_role;
