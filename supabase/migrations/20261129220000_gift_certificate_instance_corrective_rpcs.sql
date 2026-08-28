-- DIBAY Gift Admin M5: Instance corrective RPCs (suspend / resume / adjust_validity)
-- Direct field edit forbidden — dedicated RPCs with reason + audit event.

BEGIN;

CREATE OR REPLACE FUNCTION public.gift_certificate_instance_suspend(
  p_instance_id uuid,
  p_operator_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inst public.gift_certificate_instances%ROWTYPE;
  v_before jsonb;
  v_after jsonb;
BEGIN
  IF p_reason IS NULL OR length(trim(p_reason)) < 1 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'reason_required');
  END IF;

  SELECT * INTO v_inst
  FROM public.gift_certificate_instances
  WHERE id = p_instance_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'instance_not_found');
  END IF;

  IF v_inst.status = 'SUSPENDED' THEN
    RETURN jsonb_build_object('ok', true, 'status', v_inst.status, 'noop', true);
  END IF;

  IF v_inst.status = 'FULLY_REDEEMED' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cannot_suspend_fully_redeemed');
  END IF;

  v_before := to_jsonb(v_inst);

  UPDATE public.gift_certificate_instances
  SET status = 'SUSPENDED'
  WHERE id = p_instance_id
  RETURNING * INTO v_inst;

  v_after := to_jsonb(v_inst);

  INSERT INTO public.gift_admin_events (
    entity_type, entity_id, event_type, operator_id, reason, before_json, after_json
  ) VALUES (
    'instance', p_instance_id::text, 'INSTANCE_SUSPENDED', p_operator_id, trim(p_reason), v_before, v_after
  );

  RETURN jsonb_build_object('ok', true, 'status', v_inst.status);
END;
$$;

CREATE OR REPLACE FUNCTION public.gift_certificate_instance_resume(
  p_instance_id uuid,
  p_operator_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inst public.gift_certificate_instances%ROWTYPE;
  v_before jsonb;
  v_after jsonb;
  v_next text;
BEGIN
  IF p_reason IS NULL OR length(trim(p_reason)) < 1 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'reason_required');
  END IF;

  SELECT * INTO v_inst
  FROM public.gift_certificate_instances
  WHERE id = p_instance_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'instance_not_found');
  END IF;

  IF v_inst.status <> 'SUSPENDED' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_suspended');
  END IF;

  v_before := to_jsonb(v_inst);
  IF v_inst.remaining_balance <= 0 THEN
    v_next := 'FULLY_REDEEMED';
  ELSIF v_inst.remaining_balance < v_inst.face_value THEN
    v_next := 'PARTIALLY_REDEEMED';
  ELSE
    v_next := 'ACTIVE';
  END IF;

  UPDATE public.gift_certificate_instances
  SET status = v_next
  WHERE id = p_instance_id
  RETURNING * INTO v_inst;

  v_after := to_jsonb(v_inst);

  INSERT INTO public.gift_admin_events (
    entity_type, entity_id, event_type, operator_id, reason, before_json, after_json
  ) VALUES (
    'instance', p_instance_id::text, 'INSTANCE_RESUMED', p_operator_id, trim(p_reason), v_before, v_after
  );

  RETURN jsonb_build_object('ok', true, 'status', v_inst.status);
END;
$$;

CREATE OR REPLACE FUNCTION public.gift_certificate_instance_adjust_validity(
  p_instance_id uuid,
  p_operator_id uuid,
  p_reason text,
  p_valid_until date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inst public.gift_certificate_instances%ROWTYPE;
  v_before jsonb;
  v_after jsonb;
BEGIN
  IF p_reason IS NULL OR length(trim(p_reason)) < 1 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'reason_required');
  END IF;

  SELECT * INTO v_inst
  FROM public.gift_certificate_instances
  WHERE id = p_instance_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'instance_not_found');
  END IF;

  IF p_valid_until IS NOT NULL AND p_valid_until < v_inst.valid_from THEN
    RETURN jsonb_build_object('ok', false, 'error', 'valid_until_before_from');
  END IF;

  v_before := to_jsonb(v_inst);

  UPDATE public.gift_certificate_instances
  SET valid_until = p_valid_until
  WHERE id = p_instance_id
  RETURNING * INTO v_inst;

  v_after := to_jsonb(v_inst);

  INSERT INTO public.gift_admin_events (
    entity_type, entity_id, event_type, operator_id, reason, before_json, after_json
  ) VALUES (
    'instance', p_instance_id::text, 'INSTANCE_VALIDITY_ADJUSTED', p_operator_id, trim(p_reason), v_before, v_after
  );

  RETURN jsonb_build_object(
    'ok', true,
    'valid_from', v_inst.valid_from,
    'valid_until', v_inst.valid_until
  );
END;
$$;

REVOKE ALL ON FUNCTION public.gift_certificate_instance_suspend(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.gift_certificate_instance_suspend(uuid, uuid, text) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.gift_certificate_instance_resume(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.gift_certificate_instance_resume(uuid, uuid, text) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.gift_certificate_instance_adjust_validity(uuid, uuid, text, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.gift_certificate_instance_adjust_validity(uuid, uuid, text, date) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gift_certificate_instance_suspend(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.gift_certificate_instance_resume(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.gift_certificate_instance_adjust_validity(uuid, uuid, text, date) TO service_role;

COMMIT;
