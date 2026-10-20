-- AFTER 20270602140200: ORD-07 ⊃ DLV-04 snapshot RPC key assertions (no internal keys; UI keys kept).
-- Runner: see 00_fixture.sql header. Temporary rows are rolled back.
BEGIN;
DO $$
DECLARE
  r jsonb;
  o jsonb;
  d jsonb;
  k text;
  owner1 constant uuid := '0000000a-0000-0000-0000-000000000001';
  buyer constant uuid := 'bbbbbbbb-0000-0000-0000-00000000000b';
  store1 constant uuid := '11111111-0000-0000-0000-000000000001';
  order1 constant uuid := '66666666-0000-0000-0000-000000000001';
  order_internal constant text[] := ARRAY['admin_note','admin_flagged','dispute_status','external_delivery_meta'];
  buyer_money_internal constant text[] := ARRAY['commission_base_amount','store_funded_amount','platform_funded_amount','client_order_key'];
  delivery_internal constant text[] := ARRAY['admin_note','delivered_proof_image_url','delivered_proof_image_path',
    'failure_proof_image_url','failure_proof_image_path','delivered_proof_lat','delivered_proof_lng',
    'failure_report_lat','failure_report_lng'];
BEGIN
  -- owner list
  r := public.get_owner_store_orders_list_snapshot(store1, owner1, '', 60, '');
  IF (r->>'ok')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'FAIL list not ok %', r; END IF;
  IF jsonb_array_length(r->'orders') <> 1 THEN RAISE EXCEPTION 'FAIL list size %', jsonb_array_length(r->'orders'); END IF;
  o := r->'orders'->0;
  FOREACH k IN ARRAY ARRAY['admin_note','admin_flagged','dispute_status'] LOOP
    IF o ? k THEN RAISE EXCEPTION 'FAIL owner list exposes %', k; END IF;
  END LOOP;
  FOREACH k IN ARRAY ARRAY['id','order_no','order_status','admin_locked','needs_admin_attention','buyer_user_id','buyer_public_label','items','review_status','payment_amount'] LOOP
    IF NOT (o ? k) THEN RAISE EXCEPTION 'FAIL owner list lost UI key %', k; END IF;
  END LOOP;
  IF r->'status_counts_optional' IS NULL OR r->'store_pickup_address' IS NULL THEN RAISE EXCEPTION 'FAIL list envelope changed'; END IF;
  RAISE NOTICE 'PASS [ORD-07 owner list: no admin_note/admin_flagged/dispute_status, UI keys kept]';
  -- open-orders inclusion from 20270602110000 kept (p_limit 1 window + open rows)
  INSERT INTO public.store_orders (order_no, buyer_user_id, store_id, order_status, created_at)
  VALUES ('SO-OLD-OPEN', buyer, store1, 'pending', now() - interval '10 days'),
         ('SO-NEW-DONE', buyer, store1, 'completed', now() + interval '1 minute');
  r := public.get_owner_store_orders_list_snapshot(store1, owner1, '', 1, '');
  IF jsonb_array_length(r->'orders') <> 3 THEN
    RAISE EXCEPTION 'FAIL open-orders inclusion lost: % rows', jsonb_array_length(r->'orders');
  END IF;
  DELETE FROM public.store_orders WHERE order_no IN ('SO-OLD-OPEN','SO-NEW-DONE');
  RAISE NOTICE 'PASS [ORD-07 owner list keeps open-orders inclusion (1 window + 2 open)]';
  r := public.get_owner_store_orders_list_snapshot(store1, buyer, '', 60, '');
  IF r->>'error' <> 'forbidden' THEN RAISE EXCEPTION 'FAIL list owner gate %', r; END IF;

  -- owner detail
  r := public.get_owner_store_order_detail_snapshot(owner1, store1, order1);
  IF (r->>'ok')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'FAIL owner detail %', r; END IF;
  o := r->'order'; d := r->'delivery';
  FOREACH k IN ARRAY order_internal || ARRAY['client_order_key'] LOOP
    IF o ? k THEN RAISE EXCEPTION 'FAIL owner detail order exposes %', k; END IF;
  END LOOP;
  FOREACH k IN ARRAY delivery_internal LOOP
    IF d ? k THEN RAISE EXCEPTION 'FAIL owner detail delivery exposes %', k; END IF;
  END LOOP;
  FOREACH k IN ARRAY ARRAY['admin_locked','needs_admin_attention','platform_funded_amount','store_funded_amount','commission_base_amount','community_messenger_room_id','order_status'] LOOP
    IF NOT (o ? k) THEN RAISE EXCEPTION 'FAIL owner detail lost key %', k; END IF;
  END LOOP;
  FOREACH k IN ARRAY ARRAY['delivery_status','rider_id','rider_decline_reason','rider_failure_report_reason','delivered_receiver_name'] LOOP
    IF NOT (d ? k) THEN RAISE EXCEPTION 'FAIL owner detail delivery lost key %', k; END IF;
  END LOOP;
  IF r->>'review_status' <> 'not_applicable' OR jsonb_array_length(r->'items') <> 1 THEN RAISE EXCEPTION 'FAIL owner detail envelope %', r; END IF;
  IF public.get_owner_store_order_detail_snapshot(buyer, store1, order1)->>'error' <> 'forbidden' THEN RAISE EXCEPTION 'FAIL owner detail gate'; END IF;
  RAISE NOTICE 'PASS [ORD-07 owner detail: no admin/proof/coordinate keys, UI keys kept]';

  -- buyer detail
  r := public.get_buyer_store_order_detail_snapshot(buyer, order1);
  IF (r->>'ok')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'FAIL buyer detail %', r; END IF;
  o := r->'order'; d := r->'delivery';
  FOREACH k IN ARRAY order_internal || ARRAY['commission_base_amount','store_funded_amount','platform_funded_amount'] LOOP
    IF o ? k THEN RAISE EXCEPTION 'FAIL buyer detail order exposes %', k; END IF;
  END LOOP;
  FOREACH k IN ARRAY delivery_internal || ARRAY['rider_decline_reason','rider_failure_report_reason','failure_note','delivered_proof_note'] LOOP
    IF d ? k THEN RAISE EXCEPTION 'FAIL buyer detail delivery exposes %', k; END IF;
  END LOOP;
  FOREACH k IN ARRAY ARRAY['admin_locked','needs_admin_attention','payment_amount','discount_amount','gift_redemption_amount','client_order_key','community_messenger_room_id'] LOOP
    IF NOT (o ? k) THEN RAISE EXCEPTION 'FAIL buyer detail lost key %', k; END IF;
  END LOOP;
  IF NOT (d ? 'delivered_receiver_name') OR NOT (d ? 'delivery_status') THEN RAISE EXCEPTION 'FAIL buyer delivery lost keys'; END IF;
  IF NOT ((r->'items'->0) ? 'base_price_snapshot') OR (r->'store'->>'owner_user_id') IS NULL THEN RAISE EXCEPTION 'FAIL buyer items/store'; END IF;
  IF public.get_buyer_store_order_detail_snapshot(owner1, order1)->>'error' <> 'not_found' THEN RAISE EXCEPTION 'FAIL buyer gate'; END IF;
  RAISE NOTICE 'PASS [ORD-07 buyer detail: no admin/money/proof/rider-internal keys, UI keys kept]';

  -- grants: service_role only
  FOREACH k IN ARRAY ARRAY['public.get_owner_store_orders_list_snapshot(uuid,uuid,text,integer,text)',
    'public.get_owner_store_order_detail_snapshot(uuid,uuid,uuid)','public.get_buyer_store_order_detail_snapshot(uuid,uuid)'] LOOP
    IF has_function_privilege('anon', k, 'EXECUTE') OR has_function_privilege('authenticated', k, 'EXECUTE')
       OR NOT has_function_privilege('service_role', k, 'EXECUTE') THEN
      RAISE EXCEPTION 'FAIL grants on %', k;
    END IF;
  END LOOP;
  RAISE NOTICE 'PASS [ORD-07 snapshot RPC grants service_role only]';
END $$;
ROLLBACK;
