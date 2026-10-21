-- GFT-07 assertions: gift_certificate_purchase idempotency key scoped per buyer.
-- Requires 00_fixture.sql + supabase/migrations/20270603140100_gift_purchase_idempotency_buyer_scope.sql loaded.

SET test.jwt_role = 'service_role';

INSERT INTO public.profiles(id, points) VALUES
  ('a0000000-0000-0000-0000-00000000000a', 5000),
  ('b0000000-0000-0000-0000-00000000000b', 5000);
INSERT INTO public.point_ledger(user_id, entry_type, amount, balance_after, related_type, related_id) VALUES
  ('a0000000-0000-0000-0000-00000000000a', 'charge', 5000, 5000, 'point_charge', 'seed-a'),
  ('b0000000-0000-0000-0000-00000000000b', 'charge', 5000, 5000, 'point_charge', 'seed-b');
INSERT INTO public.gift_certificate_products(id, store_id, title, face_value, purchase_price)
VALUES ('bbbbbbbb-0000-0000-0000-0000000000a7', 'aaaaaaaa-0000-0000-0000-000000000001', 'PURCHASE P', 1000, 900);

-- legacy row written before the scoped key (unscoped related_id), owned by A
INSERT INTO public.gift_certificate_products(id, store_id, title, face_value, purchase_price, issued_count)
VALUES ('bbbbbbbb-0000-0000-0000-0000000000a8', 'aaaaaaaa-0000-0000-0000-000000000001', 'LEGACY SEED', 1000, 900, 1);
INSERT INTO public.gift_certificate_instances(id, product_id, store_id, purchaser_user_id, current_owner_user_id,
  face_value, purchase_price, remaining_balance, public_gift_number, created_at)
VALUES ('cccccccc-0000-0000-0000-0000000000a8', 'bbbbbbbb-0000-0000-0000-0000000000a8', 'aaaaaaaa-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-00000000000a', 1000, 900, 1000, 'GFT-LEGACY-A', '2026-09-01');
INSERT INTO public.gift_certificate_ledger(instance_id, store_id, user_id, entry_type, amount, related_type, related_id)
VALUES ('cccccccc-0000-0000-0000-0000000000a8', 'aaaaaaaa-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a',
  'ISSUED', 1000, 'gift_certificate_purchase', 'LEGACY-KEY-1');

DO $$
DECLARE
  v_a uuid := 'a0000000-0000-0000-0000-00000000000a';
  v_b uuid := 'b0000000-0000-0000-0000-00000000000b';
  v_p uuid := 'bbbbbbbb-0000-0000-0000-0000000000a7';
  ra jsonb; rb jsonb; ra2 jsonb; rl jsonb; rlb jsonb;
BEGIN
  ra := public.gift_certificate_purchase(v_a, v_p, 'same-key-1');
  PERFORM public.t_assert(ra->>'ok' = 'true' AND ra->>'idempotent' IS NULL, 'A purchase -> new instance');
  rb := public.gift_certificate_purchase(v_b, v_p, '  same-key-1 ');
  PERFORM public.t_assert(rb->>'ok' = 'true' AND rb->>'idempotent' IS NULL, 'B same key -> new instance (not idempotent)');
  PERFORM public.t_assert(ra->>'instance_id' <> rb->>'instance_id', 'A and B get different instances');
  PERFORM public.t_assert(ra->>'public_gift_number' <> rb->>'public_gift_number', 'B never sees A public number');
  PERFORM public.t_assert((SELECT current_owner_user_id = v_b AND purchaser_user_id = v_b
    FROM gift_certificate_instances WHERE id = (rb->>'instance_id')::uuid), 'B instance owned by B');
  PERFORM public.t_assert((SELECT points FROM profiles WHERE id = v_a) = 4100
    AND (SELECT points FROM profiles WHERE id = v_b) = 4100, 'A and B each charged once (900)');

  ra2 := public.gift_certificate_purchase(v_a, v_p, 'same-key-1');
  PERFORM public.t_assert(ra2->>'ok' = 'true' AND ra2->>'idempotent' = 'true'
    AND ra2->>'instance_id' = ra->>'instance_id' AND ra2->>'public_gift_number' = ra->>'public_gift_number',
    'A retry -> A instance (idempotent)');
  PERFORM public.t_assert((SELECT points FROM profiles WHERE id = v_a) = 4100, 'A retry: no second charge');
  PERFORM public.t_assert((SELECT issued_count FROM gift_certificate_products WHERE id = v_p) = 2, 'issued_count 2 after A, B, A-retry');
  PERFORM public.t_assert((SELECT count(*) FROM gift_certificate_instances WHERE product_id = v_p) = 2, 'instance count 2');

  PERFORM public.t_assert((SELECT related_id FROM gift_certificate_ledger WHERE instance_id = (ra->>'instance_id')::uuid
    AND entry_type = 'ISSUED') = v_a::text || ':same-key-1', 'gift ledger key scoped buyer:key');
  PERFORM public.t_assert((SELECT related_id FROM point_ledger WHERE user_id = v_b AND related_type = 'gift_certificate_purchase')
    = v_b::text || ':same-key-1', 'point ledger key scoped buyer:key');
  PERFORM public.t_assert((SELECT description FROM point_ledger WHERE user_id = v_b AND related_type = 'gift_certificate_purchase')
    = U&'\C0C1\D488\AD8C \AD6C\B9E4: PURCHASE P', 'point ledger description text unchanged');

  -- legacy unscoped key: same buyer retry stays idempotent, other buyer gets own instance
  rl := public.gift_certificate_purchase(v_a, v_p, 'LEGACY-KEY-1');
  PERFORM public.t_assert(rl->>'ok' = 'true' AND rl->>'idempotent' = 'true'
    AND rl->>'instance_id' = 'cccccccc-0000-0000-0000-0000000000a8', 'A retry of legacy unscoped key -> A legacy instance');
  PERFORM public.t_assert((SELECT points FROM profiles WHERE id = v_a) = 4100, 'legacy retry: no charge');
  rlb := public.gift_certificate_purchase(v_b, v_p, 'LEGACY-KEY-1');
  PERFORM public.t_assert(rlb->>'ok' = 'true' AND rlb->>'idempotent' IS NULL
    AND rlb->>'instance_id' <> 'cccccccc-0000-0000-0000-0000000000a8', 'B with A legacy key -> B own new instance');
  PERFORM public.t_assert((SELECT points FROM profiles WHERE id = v_b) = 3200, 'B charged for own purchase');
  PERFORM public.t_assert((SELECT related_id FROM gift_certificate_ledger
    WHERE instance_id = 'cccccccc-0000-0000-0000-0000000000a8') = 'LEGACY-KEY-1', 'legacy row key unchanged (D-5)');
END $$;

-- conflict that is not the buyer's own purchase -> ok:false (never another user's instance)
DO $$
DECLARE r jsonb; v_a uuid := 'a0000000-0000-0000-0000-00000000000a';
BEGIN
  -- pre-occupy the ISSUED ledger key A would write, owned by someone else (simulated foreign row)
  INSERT INTO public.gift_certificate_ledger(instance_id, user_id, entry_type, amount, related_type, related_id)
  VALUES ('cccccccc-0000-0000-0000-0000000000a8', 'b0000000-0000-0000-0000-00000000000b', 'ISSUED', 1,
          'gift_certificate_purchase', v_a::text || ':foreign-key');
  r := public.gift_certificate_purchase(v_a, 'bbbbbbbb-0000-0000-0000-0000000000a7', 'foreign-key');
  PERFORM public.t_assert(r->>'ok' = 'false' AND r->>'error' = 'purchase_conflict' AND r->>'instance_id' IS NULL,
    'conflict on a row of another user -> purchase_conflict, no foreign instance');
  PERFORM public.t_assert((SELECT points FROM profiles WHERE id = v_a) = 4100, 'conflict: charge rolled back');
END $$;

DO $$
BEGIN
  PERFORM public.t_assert(has_function_privilege('service_role', 'public.gift_certificate_purchase(uuid, uuid, text)', 'EXECUTE')
    AND NOT has_function_privilege('authenticated', 'public.gift_certificate_purchase(uuid, uuid, text)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.gift_certificate_purchase(uuid, uuid, text)', 'EXECUTE'),
    'purchase grants: service_role only');
END $$;
