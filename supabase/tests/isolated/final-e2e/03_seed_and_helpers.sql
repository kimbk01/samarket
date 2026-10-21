-- Seed rows + test helpers (isolated DB only). Policy rows = the 8 active prod store_fee_policies rows (ids, %, priority,
-- created_at copied read-only 2026-10-21); admin_settings.store_cash_order_gate = prod value ('off').

INSERT INTO auth.users(id) VALUES
  ('11111111-1111-1111-1111-111111111111'),  -- owner of store S
  ('22222222-2222-2222-2222-222222222222'),  -- owner of store S2
  ('33333333-3333-3333-3333-333333333333'),  -- buyer
  ('44444444-4444-4444-4444-444444444444');  -- stranger

INSERT INTO public.admin_settings(key, value_json) VALUES ('store_cash_order_gate', '{"value": "off"}');

INSERT INTO public.store_fee_policies (id, policy_name, store_id, category_id, topic_id, fee_percent, fixed_fee, delivery_fee_mode,
  delivery_fee_percent, is_active, starts_at, ends_at, priority, is_archived, created_at) VALUES
 ('d5893cc6-e9f4-4b47-9f20-b61a5305504a','공구류',NULL,'a89681d6-6399-46d1-9091-03e8bd2c316a',NULL,7.00,0,'none',0.00,true,NULL,NULL,60,false,'2026-08-21 02:05:53.285757+00'),
 ('d956bdae-b2df-46ea-ad39-f6b955a067c6','마트',NULL,'e43dd2b1-3e3f-4698-b048-9fca0401f8ca',NULL,7.00,0,'none',0.00,true,NULL,NULL,60,false,'2026-08-21 02:06:13.282203+00'),
 ('7270947e-2a2e-4ac3-97d4-58031326ccf9','미용',NULL,'23a7b004-8290-4aae-921f-3542b8b9c415',NULL,7.00,0,'none',0.00,true,NULL,NULL,60,false,'2026-08-21 02:06:24.265995+00'),
 ('fe32b593-bb29-4dd8-bc45-e35297adabe7','서비스',NULL,'083f4cf3-7ad4-4611-b1d8-e5ca62af8395',NULL,7.00,0,'none',0.00,true,NULL,NULL,60,false,'2026-08-21 02:06:33.821995+00'),
 ('a6cd6c19-9d56-403b-8f4f-5728ad2a89bf','식당',NULL,'85bc854d-c282-4fe0-8eb7-bf04f5240280',NULL,7.00,0,'none',0.00,true,NULL,NULL,60,false,'2026-08-21 02:06:43.358259+00'),
 ('bc055664-7996-4de6-bcef-4fd6f27fa7f9','카페',NULL,'ba3b5193-5a1c-4889-b864-bd5178d1d958',NULL,7.00,0,'none',0.00,true,NULL,NULL,60,false,'2026-08-21 02:06:51.25227+00'),
 ('3acfe137-6ab1-4ae2-80ae-a38b20a59401','펫샵',NULL,'da9dd107-d4f5-4fdf-8eb4-a5d6f4ea7308',NULL,7.00,0,'none',0.00,true,NULL,NULL,60,false,'2026-08-21 02:07:00.842506+00'),
 ('80e681c2-5263-4540-835d-d98171280c98','Platform Default',NULL,NULL,NULL,0.00,0,'none',0.00,true,NULL,NULL,100,false,'2026-08-08 02:16:08.371132+00');

-- Store S: approved, visible, open, delivery (with canonical geo), category 식당 (7%). Store S2: second store.
INSERT INTO public.stores (id, owner_user_id, store_name, slug, store_category_id, lat, lng, is_open, is_visible, approval_status,
  delivery_available, pickup_available, business_hours_json) VALUES
 ('aaaaaaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','ND3 Store','nd3-store',
  '85bc854d-c282-4fe0-8eb7-bf04f5240280',14.5547,121.0244,true,true,'approved',true,true,'{}'),
 ('aaaaaaaa-0000-0000-0000-000000000002','22222222-2222-2222-2222-222222222222','ND3 Store 2','nd3-store-2',
  '85bc854d-c282-4fe0-8eb7-bf04f5240280',14.5547,121.0244,true,true,'approved',true,true,'{}');
UPDATE public.store_sales_permissions SET allowed_to_sell = true, sales_status = 'approved';

INSERT INTO public.store_products (id, store_id, title, price, stock_qty, product_status, pickup_available, local_delivery_available) VALUES
 ('bbbbbbbb-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','Menu',500,100,'active',true,true),
 ('bbbbbbbb-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000002','Menu2',500,100,'active',true,true);

-- Store-funded fixed 100 PHP coupon + the buyer's entitlement.
INSERT INTO public.store_coupon_campaigns (id, store_id, title, discount_type, discount_value, start_at, end_at, funding_mode,
  reserved_spend_php, lifecycle_state, is_active) VALUES
 ('cccccccc-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','100 off','fixed_amount',100,
  now() - interval '1 day', now() + interval '30 days','STORE_FUNDED',1000,'active',true);
INSERT INTO public.coupon_user_entitlements (id, campaign_id, store_id, buyer_user_id, status, reserved_php, expires_at, coupon_number) VALUES
 ('dddddddd-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001',
  '33333333-3333-3333-3333-333333333333','available',100, now() + interval '30 days','CPN-ND3-0001');

-- Store gift certificate (face 300, no promo funding, 0% platform fee), owned by the buyer.
INSERT INTO public.gift_certificate_products (id, store_id, title, face_value, purchase_price) VALUES
 ('eeeeeeee-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','GC 300',300,300);
INSERT INTO public.gift_certificate_instances (id, product_id, store_id, purchaser_user_id, current_owner_user_id, face_value,
  purchase_price, remaining_balance, status, valid_from) VALUES
 ('ffffffff-0000-0000-0000-000000000001','eeeeeeee-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001',
  '33333333-3333-3333-3333-333333333333','33333333-3333-3333-3333-333333333333',300,300,300,'ACTIVE',
  public.gift_certificate_issue_date(now()) - 1);

-- Store S business Cash: 5000 minor (= 50 PHP), less than one 7% fee on a 1000 PHP order (7000 minor).
INSERT INTO public.business_cash_accounts (store_id, balance_minor) VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 5000);

-- ------------------------------------------------------------------------------------------------ helpers (test only)
CREATE TABLE public.t_ctx (k text PRIMARY KEY, v uuid NOT NULL);
GRANT SELECT, INSERT, UPDATE ON public.t_ctx TO service_role;
CREATE FUNCTION public.t_set(p_k text, p_v uuid) RETURNS uuid LANGUAGE sql AS
$$ INSERT INTO public.t_ctx(k, v) VALUES (p_k, p_v) ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v RETURNING v $$;
CREATE FUNCTION public.t_id(p_k text) RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT v FROM public.t_ctx WHERE k = p_k $$;

CREATE FUNCTION public.t_ok(p_id text, p_cond boolean, p_detail text DEFAULT '') RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_cond IS TRUE THEN
    RAISE NOTICE 'PASS %', p_id;
  ELSE
    RAISE EXCEPTION 'FAIL %: %', p_id, coalesce(p_detail, '');
  END IF;
END $$;

-- Builds a client payload whose money matches the server authority (product 500/unit, coupon 100, gift <= 300).
CREATE FUNCTION public.t_create(p_key text, p_qty integer, p_fulfillment text, p_coupon boolean, p_gift uuid,
                                p_store uuid DEFAULT 'aaaaaaaa-0000-0000-0000-000000000001',
                                p_product uuid DEFAULT 'bbbbbbbb-0000-0000-0000-000000000001',
                                p_payment_delta numeric DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  v_items numeric := 500 * p_qty;
  v_disc numeric := CASE WHEN p_coupon THEN 100 ELSE 0 END;
  v_before numeric;
  v_gift numeric := 0;
  v_order jsonb;
BEGIN
  v_before := v_items - v_disc;
  IF p_gift IS NOT NULL THEN v_gift := least(v_before, 300); END IF;
  v_order := jsonb_build_object(
    'fulfillment_type', p_fulfillment, 'total_amount', v_items, 'delivery_fee_amount', 0,
    'discount_amount', v_disc, 'amount_before_gift', v_before, 'payment_amount', v_before - v_gift + p_payment_delta,
    'payment_status', 'paid', 'buyer_payment_method', 'cod',
    'delivery_address_summary', 'BGC', 'delivery_latitude', 14.55, 'delivery_longitude', 121.05,
    'checkout_store_latitude', 14.5547, 'checkout_store_longitude', 121.0244,
    'checkout_serviceability_eligible', true, 'checkout_serviceability_max_km', 5.0,
    'checkout_serviceability_reason', 'within_radius',
    'gift_instance_ids', CASE WHEN p_gift IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(p_gift) END);
  IF p_coupon THEN
    v_order := v_order || jsonb_build_object('coupon_campaign_id', 'cccccccc-0000-0000-0000-000000000001',
                                             'user_coupon_id', 'dddddddd-0000-0000-0000-000000000001');
  END IF;
  RETURN public.create_store_order_atomic(
    '33333333-3333-3333-3333-333333333333', p_store, p_key, v_order,
    jsonb_build_array(jsonb_build_object('product_id', p_product, 'qty', p_qty, 'unit', 500,
      'base_unit_after_discount', 500, 'subtotal', v_items, 'title', 'Menu')));
END $$;

-- Runs one statement as a client role with Supabase-style JWT claims; always rolls back its own effects.
-- Returns 'rows=N' when the statement ran, or 'SQLSTATE:message' when it was refused.
CREATE FUNCTION public.t_try(p_role text, p_sub uuid, p_sql text, p_claim_role text DEFAULT NULL) RETURNS text LANGUAGE plpgsql AS $$
DECLARE n bigint;
BEGIN
  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', p_sub, 'role', coalesce(p_claim_role, p_role))::text, true);
    EXECUTE format('SET LOCAL ROLE %I', p_role);
    EXECUTE p_sql;
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE EXCEPTION USING ERRCODE = 'TT001', MESSAGE = 'rows=' || n;
  EXCEPTION
    WHEN SQLSTATE 'TT001' THEN RETURN SQLERRM;
    WHEN OTHERS THEN RETURN SQLSTATE || ':' || SQLERRM;
  END;
END $$;

GRANT EXECUTE ON FUNCTION public.t_set(text, uuid), public.t_id(text), public.t_ok(text, boolean, text),
  public.t_create(text, integer, text, boolean, uuid, uuid, uuid, numeric) TO service_role;
