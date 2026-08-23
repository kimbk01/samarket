-- C7.5 — Per-surface optimistic concurrency for Admin composition policy batch saves.

BEGIN;

CREATE TABLE IF NOT EXISTS public.store_composition_policy_surface_state (
  surface text PRIMARY KEY CHECK (surface IN ('home', 'browse')),
  revision bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT store_composition_policy_surface_state_revision_nonneg CHECK (revision >= 0)
);

COMMENT ON TABLE public.store_composition_policy_surface_state IS
  'C7.5 — Monotonic revision per composition surface for Admin CAS batch saves.';

CREATE OR REPLACE FUNCTION public.ensure_store_composition_policy_surface_state(p_surface text)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_revision bigint;
BEGIN
  IF p_surface NOT IN ('home', 'browse') THEN
    RAISE EXCEPTION 'invalid_surface';
  END IF;

  INSERT INTO public.store_composition_policy_surface_state (surface, revision)
  VALUES (p_surface, 0)
  ON CONFLICT (surface) DO NOTHING;

  SELECT revision INTO v_revision
  FROM public.store_composition_policy_surface_state
  WHERE surface = p_surface;

  RETURN COALESCE(v_revision, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.save_store_composition_policy_surface_cas(
  p_surface text,
  p_expected_revision bigint,
  p_rows jsonb,
  p_actor_id uuid,
  p_actor_nickname text
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
  v_slot text;
  v_prev public.store_composition_policy_overrides%ROWTYPE;
  v_enabled boolean;
  v_order integer;
  v_max integer;
  v_interval_consumed boolean;
  v_interval_every_n integer;
  v_action text;
BEGIN
  IF p_surface NOT IN ('home', 'browse') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_surface');
  END IF;

  IF p_expected_revision IS NULL OR p_expected_revision < 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_expected_revision');
  END IF;

  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_rows');
  END IF;

  INSERT INTO public.store_composition_policy_surface_state (surface, revision)
  VALUES (p_surface, 0)
  ON CONFLICT (surface) DO NOTHING;

  SELECT revision INTO v_current
  FROM public.store_composition_policy_surface_state
  WHERE surface = p_surface
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
    v_slot := v_row->>'slot';
    v_enabled := COALESCE((v_row->>'enabled')::boolean, false);
    v_order := COALESCE((v_row->>'order')::integer, 0);
    IF v_row->>'max' IS NULL OR v_row->>'max' = 'null' THEN
      v_max := NULL;
    ELSE
      v_max := (v_row->>'max')::integer;
    END IF;

    v_interval_consumed := COALESCE((v_row->'interval'->>'consumed')::boolean, false);
    IF v_interval_consumed THEN
      v_interval_every_n := NULLIF((v_row->'interval'->>'everyN')::integer, 0);
    ELSE
      v_interval_every_n := NULL;
    END IF;

    SELECT * INTO v_prev
    FROM public.store_composition_policy_overrides
    WHERE surface = p_surface AND slot = v_slot;

    IF FOUND THEN
      v_action := 'update';
      UPDATE public.store_composition_policy_overrides
      SET
        enabled = v_enabled,
        section_order = v_order,
        max_items = v_max,
        interval_consumed = v_interval_consumed,
        interval_every_n = v_interval_every_n,
        updated_by_user_id = p_actor_id,
        updated_at = now()
      WHERE surface = p_surface AND slot = v_slot;
    ELSE
      v_action := 'create';
      INSERT INTO public.store_composition_policy_overrides (
        surface,
        slot,
        enabled,
        section_order,
        max_items,
        interval_consumed,
        interval_every_n,
        created_by_user_id,
        updated_by_user_id
      ) VALUES (
        p_surface,
        v_slot,
        v_enabled,
        v_order,
        v_max,
        v_interval_consumed,
        v_interval_every_n,
        p_actor_id,
        p_actor_id
      );
    END IF;

    INSERT INTO public.store_composition_policy_logs (
      surface,
      slot,
      action_type,
      admin_id,
      admin_nickname,
      before_json,
      after_json,
      note
    ) VALUES (
      p_surface,
      v_slot,
      v_action,
      p_actor_id,
      COALESCE(p_actor_nickname, ''),
      CASE
        WHEN v_prev.id IS NULL THEN NULL
        ELSE jsonb_build_object(
          'enabled', v_prev.enabled,
          'order', v_prev.section_order,
          'max', v_prev.max_items,
          'interval', CASE
            WHEN v_prev.interval_consumed THEN jsonb_build_object('consumed', true, 'everyN', v_prev.interval_every_n)
            ELSE jsonb_build_object('consumed', false, 'reason', 'NOT_CONSUMED')
          END
        )
      END,
      jsonb_build_object(
        'enabled', v_enabled,
        'order', v_order,
        'max', v_max,
        'interval', CASE
          WHEN v_interval_consumed THEN jsonb_build_object('consumed', true, 'everyN', v_interval_every_n)
          ELSE jsonb_build_object('consumed', false, 'reason', 'NOT_CONSUMED')
        END
      ),
      ''
    );
  END LOOP;

  v_new_revision := v_current + 1;

  UPDATE public.store_composition_policy_surface_state
  SET revision = v_new_revision, updated_at = now()
  WHERE surface = p_surface;

  RETURN jsonb_build_object('ok', true, 'revision', v_new_revision);
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_store_composition_policy_surface_state(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_store_composition_policy_surface_cas(text, bigint, jsonb, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_store_composition_policy_surface_state(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.save_store_composition_policy_surface_cas(text, bigint, jsonb, uuid, text) TO service_role;

ALTER TABLE public.store_composition_policy_surface_state ENABLE ROW LEVEL SECURITY;

COMMIT;
