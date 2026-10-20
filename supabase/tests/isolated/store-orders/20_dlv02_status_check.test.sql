-- DLV-02 CHECK assertions. Requires 00_fixture.sql, 05_dlv02_legacy_rows.sql, then
-- supabase/migrations/20270602120100_store_order_deliveries_status_check.sql (and 10_* for helpers).
DO $$
DECLARE refused boolean; v_valid boolean; o uuid;
BEGIN
  SELECT convalidated INTO v_valid FROM pg_constraint WHERE conname = 'store_order_deliveries_status_check';
  PERFORM public.t_assert(v_valid = false, 'constraint is NOT VALID');
  PERFORM public.t_assert((SELECT delivery_status FROM store_order_deliveries WHERE order_id = 'dddddddd-0000-0000-0000-000000000001') = 'legacy_unknown',
    'legacy row untouched');

  o := public.t_new_order('ready_for_pickup');
  refused := false;
  BEGIN
    INSERT INTO store_order_deliveries(order_id, store_id, buyer_user_id, delivery_status)
    VALUES (o, 'aaaaaaaa-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 'bogus');
  EXCEPTION WHEN check_violation THEN refused := true;
  END;
  PERFORM public.t_assert(refused, 'new invalid INSERT refused');

  INSERT INTO store_order_deliveries(order_id, store_id, buyer_user_id, delivery_status)
  VALUES (o, 'aaaaaaaa-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 'waiting_rider');

  refused := false;
  BEGIN
    UPDATE store_order_deliveries SET delivery_status = 'arrived' WHERE order_id = o;
  EXCEPTION WHEN check_violation THEN refused := true;
  END;
  PERFORM public.t_assert(refused, 'invalid UPDATE refused');

  -- closing an open delivery row on order cancel (DLV-02 step 3) passes the CHECK and the pickup trigger
  UPDATE store_order_deliveries SET delivery_status = 'delivery_failed', failure_note = 'order_cancelled', failed_at = now()
   WHERE order_id = o AND delivery_status NOT IN ('delivered', 'delivery_failed');
  PERFORM public.t_assert((SELECT delivery_status FROM store_order_deliveries WHERE order_id = o) = 'delivery_failed', 'close to delivery_failed allowed');

  refused := false;
  BEGIN
    ALTER TABLE store_order_deliveries VALIDATE CONSTRAINT store_order_deliveries_status_check;
  EXCEPTION WHEN check_violation THEN refused := true;
  END;
  PERFORM public.t_assert(refused, 'VALIDATE would fail on the legacy row (so the migration must not run it)');
  PERFORM public.t_assert((SELECT delivery_status FROM store_order_deliveries WHERE order_id = 'dddddddd-0000-0000-0000-000000000001') = 'legacy_unknown',
    'legacy row still untouched');
  RAISE NOTICE 'PASS DLV-02 CHECK NOT VALID';
END $$;
