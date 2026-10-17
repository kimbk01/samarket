-- Delivery Ads ops Case status — expected-status CAS for derived (lifecycle) effects.
--
-- Risk closed: lifecycle fan-out (campaign approve/reject/… side effect) applied its Case status
-- unconditionally. If the Owner sent a message concurrently (send RPC → WAITING_ADMIN), the
-- later lifecycle write could overwrite it (e.g. RESOLVED) and the Owner's question would leave
-- the Admin Action Queue (`delivery_ad_ops` = WAITING_ADMIN) unanswered.
--
-- New overload: (p_case_id, p_status, p_expected_status). Locks the row (FOR UPDATE — same lock
-- the human-send RPC takes) and applies only when the current status equals the status the
-- caller observed. Mismatch → { ok:false, error:'status_conflict' } (no write).
-- The 2-arg function (used inside the send RPC, which already holds the row lock) is unchanged.

CREATE OR REPLACE FUNCTION public.delivery_ad_ops_apply_case_status(
  p_case_id uuid,
  p_status text,
  p_expected_status text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current text;
BEGIN
  IF p_case_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'case_not_found');
  END IF;
  IF p_expected_status IS NULL
     OR p_expected_status NOT IN ('OPEN', 'WAITING_OWNER', 'WAITING_ADMIN', 'RESOLVED') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_status');
  END IF;

  SELECT status INTO v_current
    FROM public.delivery_ad_operations_cases
   WHERE id = p_case_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'case_not_found');
  END IF;
  IF v_current IS DISTINCT FROM p_expected_status THEN
    RETURN jsonb_build_object('ok', false, 'error', 'status_conflict', 'current_status', v_current);
  END IF;

  RETURN public.delivery_ad_ops_apply_case_status(p_case_id, p_status);
END;
$$;

REVOKE ALL ON FUNCTION public.delivery_ad_ops_apply_case_status(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delivery_ad_ops_apply_case_status(uuid, text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delivery_ad_ops_apply_case_status(uuid, text, text) TO service_role;
