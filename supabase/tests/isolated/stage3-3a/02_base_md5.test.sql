-- Base check (before the 3-A migrations): the mirrored production trigger function is byte-identical to production
-- (md5(prosrc) read from production pg_proc, read-only, 2026-10-21) and the two new functions do not exist yet.
DO $$
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE proname = 'block_client_role_direct_writes'
        AND pronamespace = 'public'::regnamespace) IS DISTINCT FROM 'a9781f53647a2de2d1ebf28bfeccf216' THEN
    RAISE EXCEPTION 'ASSERT FAILED: block_client_role_direct_writes differs from prod';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE pronamespace = 'public'::regnamespace
               AND proname IN ('stores_guard_delivery_requires_geo', 'replace_store_delivery_service_areas')) THEN
    RAISE EXCEPTION 'ASSERT FAILED: new functions already present in base';
  END IF;
  RAISE NOTICE 'PASS base = prod (block_client_role_direct_writes md5) and new functions absent';
END $$;
