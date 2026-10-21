-- PRD-11 / PRD-15 base: production has neither the function (pg_proc count 0) nor the column
-- (information_schema, read-only 2026-10-21). The fixture must match before the migration runs.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'reorder_store_menu_sections') THEN
    RAISE EXCEPTION 'FAIL base: reorder_store_menu_sections already exists';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'store_products' AND column_name = 'client_request_id') THEN
    RAISE EXCEPTION 'FAIL base: client_request_id already exists';
  END IF;
  RAISE NOTICE 'base check ok';
END $$;
