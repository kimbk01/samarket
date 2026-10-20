-- DLV-02: a legacy row with a value outside the new CHECK set, inserted BEFORE the CHECK migration,
-- proves NOT VALID leaves existing rows untouched (D-5).
INSERT INTO public.stores(id, owner_user_id) VALUES ('aaaaaaaa-0000-0000-0000-0000000000d1', '11111111-1111-1111-1111-111111111111');
INSERT INTO public.store_orders(id, order_no, buyer_user_id, store_id, payment_status, order_status, fulfillment_type)
VALUES ('dddddddd-0000-0000-0000-000000000001', 'LEGACY-1', '33333333-3333-3333-3333-333333333333',
        'aaaaaaaa-0000-0000-0000-0000000000d1', 'paid', 'completed', 'local_delivery');
INSERT INTO public.store_order_deliveries(order_id, store_id, buyer_user_id, delivery_status)
VALUES ('dddddddd-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000d1', '33333333-3333-3333-3333-333333333333', 'legacy_unknown');
