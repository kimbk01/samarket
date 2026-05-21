-- Owner dashboard GET …/order-counts — ownership gate + store_ops meta + KPI counts 단일 RPC (1 app RTT).
-- CONTRACT: 거부 시 { ok: false, error } — 성공 시 get_owner_store_ops_snapshot_counts 필드 + is_open + business_hours_json.

CREATE OR REPLACE FUNCTION public.get_owner_store_ops_dashboard_snapshot(
  p_store_id uuid,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_is_open boolean;
  v_hours jsonb;
  v_counts jsonb;
BEGIN
  SELECT s.owner_user_id, s.is_open, s.business_hours_json
  INTO v_owner, v_is_open, v_hours
  FROM public.stores AS s
  WHERE s.id = p_store_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'store_not_found');
  END IF;

  IF v_owner IS DISTINCT FROM p_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  v_counts := public.get_owner_store_ops_snapshot_counts(p_store_id);

  RETURN jsonb_build_object(
    'ok', true,
    'is_open', coalesce(v_is_open, false),
    'business_hours_json', coalesce(v_hours, '{}'::jsonb)
  ) || v_counts;
END;
$$;

COMMENT ON FUNCTION public.get_owner_store_ops_dashboard_snapshot(uuid, uuid) IS
  'Owner order-counts cold path: owner gate + store_ops meta + snapshot counts in one SECURITY DEFINER call (service_role).';

REVOKE ALL ON FUNCTION public.get_owner_store_ops_dashboard_snapshot(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_owner_store_ops_dashboard_snapshot(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.get_owner_store_ops_dashboard_snapshot(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_owner_store_ops_dashboard_snapshot(uuid, uuid) TO service_role;
