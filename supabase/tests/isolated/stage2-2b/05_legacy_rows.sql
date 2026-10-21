-- Legacy rows that exist BEFORE the stage 2-B migrations (D-5: preserved, never corrected).
-- Loaded after 00_fixture.sql and before the migrations under test.

\set owner  '''11111111-1111-1111-1111-111111111111'''
\set buyer  '''33333333-3333-3333-3333-333333333333'''
\set store  '''aaaaaaaa-0000-0000-0000-000000000001'''

INSERT INTO public.stores(id, owner_user_id, store_name) VALUES (:store, :owner, 'H example store');

-- Legacy order L1: gift 300 (net 270) + platform coupon 40, minted the OLD way (gift gross + coupon = 340)
-- on 2026-09-01 (before the cutoff 2026-10-20 20:30 UTC).
INSERT INTO public.store_orders(id, order_no, buyer_user_id, store_id, order_status, total_amount, discount_amount,
  payment_amount, delivery_fee_amount, store_funded_amount, platform_funded_amount, gift_redemption_amount, created_at)
VALUES ('bbbbbbbb-0000-0000-0000-00000000000a', 'L-1', :buyer, :store, 'completed', 1050, 140,
  610, 50, 100, 40, 300, '2026-09-01 00:00:00+00');
INSERT INTO public.gift_certificate_redemptions(order_id, store_id, redeemed_amount, platform_fee_amount, merchant_net_amount)
VALUES ('bbbbbbbb-0000-0000-0000-00000000000a', :store, 300, 30, 270);
INSERT INTO public.store_economic_point_accounts(store_id, balance) VALUES (:store, 340);
INSERT INTO public.store_economic_point_ledger(store_id, entry_kind, amount, balance_after, related_type, related_id,
  idempotency_key, created_at)
VALUES (:store, 'SALE_EARN', 340, 340, 'store_order', 'bbbbbbbb-0000-0000-0000-00000000000a',
  'sale_coin:bbbbbbbb-0000-0000-0000-00000000000a', '2026-09-01 01:00:00+00');

-- Legacy fee policy with delivery_fee_mode = 'percent' (prod has 0 such rows; proves NOT VALID keeps old rows).
INSERT INTO public.store_fee_policies(id, policy_name, fee_percent, delivery_fee_mode, delivery_fee_percent)
VALUES ('cccccccc-0000-0000-0000-000000000001', 'legacy percent', 7, 'percent', 5);
