-- ADDR-DATA-003/004: 대표 주소 원자 지정 + 주소 생성 멱등 키
-- 운영 적용: 2026-10-21 (Owner 수동 실행, SQL Editor)

ALTER TABLE public.user_addresses ADD COLUMN IF NOT EXISTS client_request_id text;

CREATE UNIQUE INDEX IF NOT EXISTS user_addresses_user_client_request_uidx
  ON public.user_addresses (user_id, client_request_id)
  WHERE client_request_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.user_address_set_master(p_user_id uuid, p_address_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('user_addresses_master:' || p_user_id::text));

  PERFORM 1 FROM public.user_addresses
   WHERE id = p_address_id AND user_id = p_user_id AND is_active
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'address_not_found');
  END IF;

  UPDATE public.user_addresses SET is_default_master = false
   WHERE user_id = p_user_id AND is_active AND is_default_master AND id <> p_address_id;

  UPDATE public.user_addresses SET is_default_master = true
   WHERE id = p_address_id AND NOT is_default_master;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.user_address_set_master(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.user_address_set_master(uuid, uuid) TO service_role;
