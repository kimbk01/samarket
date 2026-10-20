-- Isolated fixture (Production 격리 로컬 PostgreSQL 16 전용 — 운영·테스트 Supabase 프로젝트 사용 금지)
-- 대상: 20270602140000 (N-1·N-3·N-2·N-4A·N-5), 20270602140100 (ND-2), 20270602140200 (ORD-07 ⊃ DLV-04)
-- 컬럼 정의는 운영(ckdosyydvgzqwpbwuhon) information_schema 읽기 전용 조회(2026-10-21 PHT)에서 필요한 것만 복사.
-- 정책·권한은 운영 pg_policies / role_table_grants 를 그대로 재현(적용 전 상태).
--
-- Runner (예: 로컬 PG16, trust auth):
--   H=/var/tmp/samarket_pgiso_agent_a; P=55433   # 또는 BRIEF 의 scratchpad/pgiso:55432
--   createdb -h $H -p $P -U postgres iso_agent_c_store_contract
--   psql -h $H -p $P -U postgres -d iso_agent_c_store_contract -v ON_ERROR_STOP=1 \
--     -f supabase/tests/isolated/store-contract/00_fixture.sql \
--     -f supabase/tests/isolated/store-contract/01_helpers.sql \
--     -f supabase/migrations/20270602100000_delivery_owner_p0_store_write_lock.sql \
--     -f supabase/tests/isolated/store-contract/05_pre_migration_baseline_test.sql \
--     -f supabase/migrations/20270602140000_delivery_owner_1d_client_write_lock.sql \
--     -f supabase/migrations/20270602140000_delivery_owner_1d_client_write_lock.sql \
--     -f supabase/migrations/20270602140100_store_core_info_reverification_flag.sql \
--     -f supabase/migrations/20270602140200_store_order_snapshots_explicit_columns.sql \
--     -f supabase/migrations/20270602140100_store_core_info_reverification_flag.sql \
--     -f supabase/tests/isolated/store-contract/10_write_lock_test.sql \
--     -f supabase/tests/isolated/store-contract/20_core_info_flag_test.sql \
--     -f supabase/tests/isolated/store-contract/30_order_snapshot_keys_test.sql
--   (140000·140100 를 두 번 적용 = 재적용 멱등성 확인)
--   dropdb -h $H -p $P -U postgres iso_agent_c_store_contract

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $fn$
  SELECT nullif(current_setting('request.jwt.claims', true)::json->>'sub', '')::uuid
$fn$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

CREATE SCHEMA IF NOT EXISTS internal;
GRANT USAGE ON SCHEMA internal TO anon, authenticated, service_role;

CREATE TABLE public.admin_memberships (
  user_id uuid NOT NULL, status text NOT NULL, role text NOT NULL
);

-- drift objects as in prod (before 20270602140000 pins them): EXECUTE for authenticated/service_role only
CREATE OR REPLACE FUNCTION internal.is_admin_user() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $fn$ select exists (select 1 from public.admin_memberships m where m.user_id=auth.uid() and m.status='active' and m.role in ('admin','super_admin')) $fn$;
CREATE OR REPLACE FUNCTION internal.is_platform_admin(check_uid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $fn$ SELECT check_uid IS NOT NULL AND EXISTS (SELECT 1 FROM public.admin_memberships m WHERE m.user_id = check_uid AND m.status = 'active' AND m.role IN ('admin','super_admin')); $fn$;
REVOKE ALL ON FUNCTION internal.is_admin_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION internal.is_platform_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION internal.is_admin_user() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION internal.is_platform_admin(uuid) TO authenticated, service_role;

CREATE TABLE public.stores (
  id uuid PRIMARY KEY, owner_user_id uuid NOT NULL, store_name text NOT NULL, slug text NOT NULL,
  approval_status text NOT NULL DEFAULT 'pending', is_visible boolean NOT NULL DEFAULT false,
  profile_image_url text, region text, city text, district text, address_line1 text, address_line2 text,
  lat double precision, lng double precision, rejected_reason text, revision_note text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.store_sales_permissions (
  store_id uuid NOT NULL, allowed_to_sell boolean NOT NULL DEFAULT false, sales_status text NOT NULL DEFAULT 'pending'
);
CREATE TABLE public.store_products (
  id uuid PRIMARY KEY, store_id uuid NOT NULL, title text NOT NULL, product_status text NOT NULL DEFAULT 'active'
);

CREATE TABLE public.store_inquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), store_id uuid NOT NULL, from_user_id uuid NOT NULL,
  inquiry_type text, subject text NOT NULL, content text NOT NULL, status text DEFAULT 'open', answer text,
  answered_by_user_id uuid, answered_at timestamptz, escalated_to_admin_at timestamptz,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);
CREATE TABLE public.store_business_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), store_id uuid NOT NULL, owner_user_id uuid NOT NULL,
  representative_name text, business_registration_no text, business_verification_status text DEFAULT 'pending',
  status text, reviewed_by_admin_id uuid, reviewed_at timestamptz, review_memo text,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);
CREATE TABLE public.user_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, city_municipality text,
  latitude double precision, longitude double precision, full_address text, is_active boolean DEFAULT true,
  canonical_lgu_id text, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);

-- N-4A money tables (minimal columns)
CREATE TABLE public.store_economic_point_accounts (store_id uuid PRIMARY KEY, balance bigint NOT NULL DEFAULT 0);
CREATE TABLE public.store_economic_point_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), store_id uuid NOT NULL, amount bigint NOT NULL,
  idempotency_key text UNIQUE, created_at timestamptz DEFAULT now()
);
CREATE TABLE public.coin_withdrawal_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), store_id uuid NOT NULL, owner_user_id uuid NOT NULL,
  amount bigint NOT NULL, status text NOT NULL DEFAULT 'REQUESTED'
);
CREATE TABLE public.gift_certificate_revenue_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), store_id uuid NOT NULL, entry_type text NOT NULL, amount bigint NOT NULL
);
CREATE TABLE public.business_cash_charge_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_user_id uuid NOT NULL, amount bigint NOT NULL,
  status text NOT NULL DEFAULT 'PENDING'
);
CREATE TABLE public.business_cash_conversion_rate_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), rate numeric NOT NULL, is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE public.store_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), store_id uuid NOT NULL, order_id uuid,
  settlement_status text NOT NULL DEFAULT 'scheduled', commission_reversal_amount bigint NOT NULL DEFAULT 0
);

-- ORD-07 tables (store_orders = all prod columns)
CREATE TABLE public.profiles (id uuid PRIMARY KEY, display_name text, nickname text, username text);
CREATE TABLE public.store_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_no text NOT NULL, buyer_user_id uuid NOT NULL, store_id uuid NOT NULL,
  total_amount bigint NOT NULL DEFAULT 0, discount_amount bigint NOT NULL DEFAULT 0, payment_amount bigint NOT NULL DEFAULT 0,
  payment_status text NOT NULL DEFAULT 'pending', order_status text NOT NULL DEFAULT 'pending',
  fulfillment_type text NOT NULL DEFAULT 'pickup', buyer_note text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), auto_complete_at timestamptz,
  buyer_phone text, delivery_fee_amount bigint NOT NULL DEFAULT 0, delivery_courier_label text,
  delivery_address_summary text, delivery_address_detail text, buyer_payment_method text, buyer_payment_method_detail text,
  external_delivery_provider text, external_delivery_order_id text, external_delivery_status text,
  external_delivery_meta jsonb NOT NULL DEFAULT '{}'::jsonb, external_delivery_updated_at timestamptz,
  community_messenger_room_id uuid, estimated_prep_minutes integer, estimated_ready_at timestamptz, accepted_at timestamptz,
  admin_locked boolean NOT NULL DEFAULT false, admin_flagged boolean NOT NULL DEFAULT false, admin_note text,
  refund_approved_at timestamptz, refunded_at timestamptz, dispute_status text,
  sla_warning_level text, sla_warning_reason text, sla_warning_at timestamptz, needs_admin_attention boolean NOT NULL DEFAULT false,
  client_order_key text, delivery_region text, delivery_city text,
  checkout_prep_minutes integer, checkout_ride_minutes integer, checkout_eta_minutes integer, checkout_eta_computed_at timestamptz,
  delivery_user_address_id uuid, checkout_route_distance_meters integer, delivery_place_id text,
  delivery_formatted_address text, delivery_detail_address text, delivery_note text,
  delivery_latitude double precision, delivery_longitude double precision, checkout_straight_distance_meters integer,
  coupon_campaign_id uuid, user_coupon_id uuid, store_funded_amount numeric NOT NULL DEFAULT 0,
  platform_funded_amount numeric NOT NULL DEFAULT 0, commission_base_amount numeric, coupon_offer_title text, coupon_number text,
  gift_redemption_amount integer NOT NULL DEFAULT 0, amount_before_gift integer NOT NULL DEFAULT 0,
  checkout_store_latitude double precision, checkout_store_longitude double precision,
  checkout_serviceability_eligible boolean, checkout_serviceability_max_km double precision, checkout_serviceability_reason text
);
CREATE TABLE public.store_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL, product_id uuid NOT NULL,
  product_title_snapshot text NOT NULL, price_snapshot bigint NOT NULL, qty integer NOT NULL, subtotal bigint NOT NULL,
  options_snapshot_json jsonb NOT NULL DEFAULT '{}'::jsonb, base_price_snapshot integer, options_unit_delta_snapshot integer
);
CREATE TABLE public.store_order_deliveries (
  order_id uuid PRIMARY KEY, store_id uuid NOT NULL, buyer_user_id uuid NOT NULL, rider_id uuid,
  delivery_status text NOT NULL DEFAULT 'waiting_rider', assigned_at timestamptz, picked_up_at timestamptz,
  delivered_at timestamptz, admin_note text, created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(), rider_accepted_at timestamptz, customer_arrived_at timestamptz,
  rider_decline_reason text, delivered_proof_image_url text, delivered_proof_note text, delivered_receiver_name text,
  delivered_confirmed_at timestamptz, delivered_proof_lat double precision, delivered_proof_lng double precision,
  failure_proof_image_url text, failure_note text, rider_failure_reported_at timestamptz, rider_failure_report_reason text,
  failure_report_lat double precision, failure_report_lng double precision, failed_at timestamptz,
  delivered_proof_image_path text, failure_proof_image_path text
);
CREATE TABLE public.store_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL, store_id uuid NOT NULL,
  buyer_user_id uuid NOT NULL, rating smallint NOT NULL, content text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.store_order_buyer_hides (buyer_user_id uuid NOT NULL, order_id uuid NOT NULL);

CREATE OR REPLACE FUNCTION public.owner_orders_list_buyer_public_label(p_display text, p_nick text, p_user text)
RETURNS text LANGUAGE sql IMMUTABLE AS $fn$ SELECT coalesce(nullif(p_nick, ''), nullif(p_display, ''), nullif(p_user, ''), 'buyer') $fn$;
CREATE OR REPLACE FUNCTION public.get_owner_store_ops_dashboard_snapshot(p_store_id uuid, p_owner_user_id uuid)
RETURNS jsonb LANGUAGE sql STABLE AS $fn$ SELECT jsonb_build_object('pending_accept_count', 1, 'refund_requested_count', 0, 'pending_delivery_count', 0) $fn$;

-- prod-like table grants (ALL to API roles) and RLS
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['stores','store_products','store_sales_permissions','store_inquiries','store_business_verifications',
    'user_addresses','store_economic_point_accounts','store_economic_point_ledger','coin_withdrawal_requests',
    'gift_certificate_revenue_ledger','business_cash_charge_requests','business_cash_conversion_rate_policies',
    'store_settlements','store_orders','store_order_items','store_order_deliveries','store_reviews','profiles']
  LOOP
    EXECUTE format('GRANT ALL ON public.%I TO anon, authenticated, service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    -- Supabase service_role has BYPASSRLS; the shared local cluster role may not -> emulate per table
    -- (keeps the cluster-wide role untouched for other isolated databases).
    EXECUTE format('CREATE POLICY iso_service_role_bypass ON public.%I TO service_role USING (true) WITH CHECK (true)', t);
  END LOOP;
END $$;

-- prod policies (verbatim qual / with_check)
CREATE POLICY stores_public_read_approved ON public.stores FOR SELECT
  USING (((approval_status = 'approved') AND (is_visible = true)) OR (owner_user_id = auth.uid()) OR internal.is_admin_user());
CREATE POLICY stores_update_owner_or_admin ON public.stores FOR UPDATE
  USING ((owner_user_id = auth.uid()) OR internal.is_admin_user());
CREATE POLICY store_products_owner_all ON public.store_products FOR ALL
  USING (internal.is_admin_user() OR EXISTS (SELECT 1 FROM stores s WHERE s.id = store_products.store_id AND s.owner_user_id = auth.uid()))
  WITH CHECK (internal.is_admin_user() OR EXISTS (SELECT 1 FROM stores s WHERE s.id = store_products.store_id AND s.owner_user_id = auth.uid()));
CREATE POLICY store_products_public_active ON public.store_products FOR SELECT
  USING ((product_status = 'active') AND EXISTS (SELECT 1 FROM stores s WHERE s.id = store_products.store_id AND s.approval_status = 'approved' AND s.is_visible = true));

CREATE POLICY store_inquiries_insert_buyer ON public.store_inquiries FOR INSERT
  WITH CHECK ((from_user_id = auth.uid()) AND EXISTS (SELECT 1 FROM stores s WHERE s.id = store_inquiries.store_id AND s.approval_status = 'approved' AND s.is_visible = true));
CREATE POLICY store_inquiries_select_buyer_or_owner ON public.store_inquiries FOR SELECT
  USING ((from_user_id = auth.uid()) OR EXISTS (SELECT 1 FROM stores s WHERE s.id = store_inquiries.store_id AND s.owner_user_id = auth.uid()));
CREATE POLICY store_inquiries_update_owner ON public.store_inquiries FOR UPDATE
  USING (EXISTS (SELECT 1 FROM stores s WHERE s.id = store_inquiries.store_id AND s.owner_user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM stores s WHERE s.id = store_inquiries.store_id AND s.owner_user_id = auth.uid()));

CREATE POLICY store_biz_ver_insert_owner ON public.store_business_verifications FOR INSERT
  WITH CHECK ((owner_user_id = auth.uid()) AND EXISTS (SELECT 1 FROM stores s WHERE s.id = store_business_verifications.store_id AND s.owner_user_id = auth.uid()));
CREATE POLICY store_biz_ver_select ON public.store_business_verifications FOR SELECT
  USING (internal.is_admin_user() OR (owner_user_id = auth.uid()) OR EXISTS (SELECT 1 FROM stores s WHERE s.id = store_business_verifications.store_id AND s.owner_user_id = auth.uid()));
CREATE POLICY store_biz_ver_update_owner_admin ON public.store_business_verifications FOR UPDATE
  USING (internal.is_admin_user() OR (owner_user_id = auth.uid()));

CREATE POLICY user_addresses_select_own ON public.user_addresses FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY user_addresses_insert_own ON public.user_addresses FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY user_addresses_update_own ON public.user_addresses FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY user_addresses_delete_own ON public.user_addresses FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY store_economic_point_accounts_owner_select ON public.store_economic_point_accounts FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM stores s WHERE s.id = store_economic_point_accounts.store_id AND s.owner_user_id = auth.uid()));

-- SECURITY DEFINER writer stand-ins (owner postgres) — same shape as prod coin / gift RPCs
CREATE OR REPLACE FUNCTION public.iso_coin_definer_credit(p_store uuid, p_amount bigint, p_key text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  INSERT INTO public.store_economic_point_accounts(store_id, balance) VALUES (p_store, p_amount)
  ON CONFLICT (store_id) DO UPDATE SET balance = store_economic_point_accounts.balance + EXCLUDED.balance;
  INSERT INTO public.store_economic_point_ledger(store_id, amount, idempotency_key) VALUES (p_store, p_amount, p_key);
  INSERT INTO public.gift_certificate_revenue_ledger(store_id, entry_type, amount) VALUES (p_store, 'recognize', p_amount);
  INSERT INTO public.coin_withdrawal_requests(store_id, owner_user_id, amount) VALUES (p_store, p_store, p_amount);
END;
$fn$;
REVOKE ALL ON FUNCTION public.iso_coin_definer_credit(uuid, bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_coin_definer_credit(uuid, bigint, text) TO service_role;

-- seed
INSERT INTO public.admin_memberships VALUES ('aaaaaaaa-0000-0000-0000-00000000000a', 'active', 'admin');
INSERT INTO public.stores (id, owner_user_id, store_name, slug, approval_status, is_visible, region, city, district, address_line1, lat, lng)
VALUES
  ('11111111-0000-0000-0000-000000000001', '0000000a-0000-0000-0000-000000000001', 'Approved Store', 'approved-store', 'approved', true,
   'Metro Manila', 'Quezon City', 'Diliman', '1 Main St', 14.65, 121.05),
  ('11111111-0000-0000-0000-000000000002', '0000000a-0000-0000-0000-000000000002', 'Rejected Store', 'rejected-store', 'rejected', false,
   'Metro Manila', 'Makati', 'Poblacion', '2 Side St', 14.56, 121.02);
INSERT INTO public.store_products VALUES ('22222222-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'Rice', 'active');
INSERT INTO public.store_inquiries (id, store_id, from_user_id, subject, content)
VALUES ('33333333-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-00000000000b', 'Allergy', 'original text');
INSERT INTO public.store_business_verifications (id, store_id, owner_user_id)
VALUES ('44444444-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', '0000000a-0000-0000-0000-000000000001');
INSERT INTO public.user_addresses (id, user_id, city_municipality, canonical_lgu_id)
VALUES ('55555555-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-00000000000b', 'Quezon City', 'ph-qc');
INSERT INTO public.store_economic_point_accounts VALUES ('11111111-0000-0000-0000-000000000001', 100);
INSERT INTO public.business_cash_charge_requests (owner_user_id, amount) VALUES ('0000000a-0000-0000-0000-000000000001', 500);
INSERT INTO public.business_cash_conversion_rate_policies (rate) VALUES (1);
INSERT INTO public.store_settlements (store_id) VALUES ('11111111-0000-0000-0000-000000000001');

INSERT INTO public.profiles VALUES ('bbbbbbbb-0000-0000-0000-00000000000b', 'Buyer B', 'bee', 'buyerb');
INSERT INTO public.store_orders (id, order_no, buyer_user_id, store_id, total_amount, payment_amount, order_status, fulfillment_type,
  admin_note, admin_flagged, dispute_status, commission_base_amount, store_funded_amount, platform_funded_amount,
  external_delivery_meta, client_order_key, admin_locked, needs_admin_attention)
VALUES ('66666666-0000-0000-0000-000000000001', 'SO-1', 'bbbbbbbb-0000-0000-0000-00000000000b', '11111111-0000-0000-0000-000000000001',
  500, 500, 'delivering', 'delivery', 'INTERNAL NOTE', true, 'open', 450, 20, 30, '{"secret":"x"}', 'ck-1', false, true);
INSERT INTO public.store_order_items (order_id, product_id, product_title_snapshot, price_snapshot, qty, subtotal)
VALUES ('66666666-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001', 'Rice', 500, 1, 500);
INSERT INTO public.store_order_deliveries (order_id, store_id, buyer_user_id, delivery_status, admin_note,
  delivered_proof_image_url, delivered_proof_image_path, failure_proof_image_url, failure_proof_image_path,
  delivered_proof_lat, delivered_proof_lng, failure_report_lat, failure_report_lng, delivered_receiver_name,
  rider_decline_reason, failure_note, delivered_proof_note)
VALUES ('66666666-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-00000000000b',
  'delivering', 'DELIVERY INTERNAL', 'https://x/p.jpg', 'proofs/p.jpg', 'https://x/f.jpg', 'proofs/f.jpg',
  14.6, 121.0, 14.7, 121.1, 'Juan', 'too far', 'gate closed', 'left at door');
