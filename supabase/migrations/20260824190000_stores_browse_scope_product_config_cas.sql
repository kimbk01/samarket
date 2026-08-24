-- Wire browse scope product_config (cardType etc.) through CAS saver.

BEGIN;

CREATE OR REPLACE FUNCTION public.save_store_browse_scope_policy_cas(
  p_expected_revision bigint,
  p_rows jsonb,
  p_actor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current bigint;
  v_new_revision bigint;
  v_row jsonb;
  v_scope_key text;
  v_product_config jsonb;
BEGIN
  IF p_expected_revision IS NULL OR p_expected_revision < 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_expected_revision');
  END IF;

  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_rows');
  END IF;

  INSERT INTO public.store_browse_scope_policy_state (id, revision)
  VALUES ('global', 0)
  ON CONFLICT (id) DO NOTHING;

  SELECT revision INTO v_current
  FROM public.store_browse_scope_policy_state
  WHERE id = 'global'
  FOR UPDATE;

  IF v_current IS DISTINCT FROM p_expected_revision THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'stale_revision',
      'current_revision', v_current,
      'expected_revision', p_expected_revision
    );
  END IF;

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    v_scope_key := v_row->>'scopeKey';
    v_product_config := COALESCE(v_row->'productConfig', '{}'::jsonb);
    INSERT INTO public.store_browse_scope_policy (
      scope_key,
      primary_slug,
      sub_slug,
      enabled,
      display_title_ko,
      display_title_en,
      ad_enabled,
      coupon_enabled,
      max_insertion,
      interval_every_n,
      presentation_mode,
      schedule_start,
      schedule_end,
      product_config,
      updated_by_user_id
    )
    VALUES (
      v_scope_key,
      v_row->>'primarySlug',
      NULLIF(v_row->>'subSlug', ''),
      COALESCE((v_row->>'enabled')::boolean, true),
      NULLIF(v_row->>'displayTitleKo', ''),
      NULLIF(v_row->>'displayTitleEn', ''),
      COALESCE(v_row->>'adEnabled', 'inherit'),
      COALESCE(v_row->>'couponEnabled', 'inherit'),
      CASE WHEN v_row->>'maxInsertion' IS NULL OR v_row->>'maxInsertion' = 'null' THEN NULL
           ELSE (v_row->>'maxInsertion')::integer END,
      CASE WHEN v_row->>'intervalEveryN' IS NULL OR v_row->>'intervalEveryN' = 'null' THEN NULL
           ELSE (v_row->>'intervalEveryN')::integer END,
      COALESCE(v_row->>'presentationMode', 'inherit'),
      CASE WHEN v_row->>'scheduleStart' IS NULL OR v_row->>'scheduleStart' = 'null' THEN NULL
           ELSE (v_row->>'scheduleStart')::timestamptz END,
      CASE WHEN v_row->>'scheduleEnd' IS NULL OR v_row->>'scheduleEnd' = 'null' THEN NULL
           ELSE (v_row->>'scheduleEnd')::timestamptz END,
      v_product_config,
      p_actor_id
    )
    ON CONFLICT (scope_key) DO UPDATE SET
      enabled = EXCLUDED.enabled,
      display_title_ko = EXCLUDED.display_title_ko,
      display_title_en = EXCLUDED.display_title_en,
      ad_enabled = EXCLUDED.ad_enabled,
      coupon_enabled = EXCLUDED.coupon_enabled,
      max_insertion = EXCLUDED.max_insertion,
      interval_every_n = EXCLUDED.interval_every_n,
      presentation_mode = EXCLUDED.presentation_mode,
      schedule_start = EXCLUDED.schedule_start,
      schedule_end = EXCLUDED.schedule_end,
      product_config = EXCLUDED.product_config,
      updated_by_user_id = EXCLUDED.updated_by_user_id;
  END LOOP;

  v_new_revision := v_current + 1;
  UPDATE public.store_browse_scope_policy_state
  SET revision = v_new_revision, updated_at = now()
  WHERE id = 'global';

  RETURN jsonb_build_object('ok', true, 'revision', v_new_revision);
END;
$$;

COMMIT;
