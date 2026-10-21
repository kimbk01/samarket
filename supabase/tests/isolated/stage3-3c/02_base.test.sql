-- Base check (before the 3-C migration): production has none of the objects this migration adds
-- (read-only check of production information_schema / pg_proc / pg_indexes, 2026-10-21). The fixture mirrors that.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'store_coupon_campaigns'
              AND column_name IN ('paused_by', 'source_campaign_id', 'client_request_id')) THEN
    RAISE EXCEPTION 'ASSERT FAILED: base already has 3-C columns';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'store_coupon_campaigns_auto_end_expired') THEN
    RAISE EXCEPTION 'ASSERT FAILED: base already has auto end function';
  END IF;
  RAISE NOTICE 'PASS base = prod (no 3-C objects)';
END $$;
