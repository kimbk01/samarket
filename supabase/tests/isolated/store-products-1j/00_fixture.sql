-- 1-J 격리 DB 픽스처 (운영 분리 로컬 PostgreSQL 16 전용 — 운영/테스트 Supabase 프로젝트에 실행 금지)
--
-- 러너 (DB 이름은 자유):
--   H=<pg socket dir>; P=55432
--   createdb -h $H -p $P -U postgres iso_1j
--   psql -h $H -p $P -U postgres -d iso_1j -v ON_ERROR_STOP=1 -f supabase/tests/isolated/store-products-1j/00_fixture.sql
--   psql -h $H -p $P -U postgres -d iso_1j -v ON_ERROR_STOP=1 -f supabase/migrations/20270602130000_store_products_review_lock_stock_reason.sql
--   psql -h $H -p $P -U postgres -d iso_1j -v ON_ERROR_STOP=1 -f supabase/tests/isolated/store-products-1j/10_assertions.sql
--   (동시성) bash supabase/tests/isolated/store-products-1j/20_concurrency.sh $H $P iso_1j
--   (D-5 NOT VALID) bash supabase/tests/isolated/store-products-1j/30_not_valid_when_history_violates.sh $H $P iso_1j_nv
--   마이그레이션은 2회 적용해도 오류가 없어야 한다(재실행 안전) — 러너가 2회 적용 후 단언을 돌린다.
--
-- 컬럼 정의는 운영 information_schema / pg_attribute 읽기 전용 조회(2026-10-20)에서 복사.
-- FK·RLS·운영 트리거(수수료 등)는 이 테스트 범위 밖이라 생략한다. 마이그레이션 적용 "전" 상태를 만든다.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END
$$;

CREATE SCHEMA IF NOT EXISTS auth;
-- Supabase auth.role() stub: reads request.jwt.claim.role (set per test session)
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.role', true), '')
$$;

CREATE TABLE public.stores (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_user_id uuid NOT NULL,
  store_name text NOT NULL,
  slug text NOT NULL,
  approval_status text NOT NULL DEFAULT 'pending',
  is_visible boolean NOT NULL DEFAULT false,
  is_open boolean NOT NULL DEFAULT true,
  point_commerce_blocked boolean NOT NULL DEFAULT false,
  business_hours_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  menu_sold_out_bottom boolean NOT NULL DEFAULT false
);

CREATE TABLE public.store_sales_permissions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id uuid NOT NULL,
  allowed_to_sell boolean NOT NULL DEFAULT false,
  sales_status text NOT NULL DEFAULT 'pending'
);

CREATE TABLE public.store_menu_sections (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id uuid NOT NULL,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  description text,
  is_hidden boolean NOT NULL DEFAULT false
);

-- store_products: 운영 컬럼·CHECK 그대로 (마이그레이션 전)
CREATE TABLE public.store_products (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id uuid NOT NULL,
  category_id uuid,
  title text NOT NULL,
  summary text,
  description_html text,
  price bigint NOT NULL CHECK (price >= 0),
  discount_price bigint CONSTRAINT store_products_discount_price_check CHECK ((discount_price IS NULL) OR (discount_price >= 0)),
  stock_qty integer NOT NULL DEFAULT 0 CONSTRAINT store_products_stock_qty_check CHECK (stock_qty >= 0),
  min_order_qty integer NOT NULL DEFAULT 1,
  max_order_qty integer NOT NULL DEFAULT 99,
  product_status text NOT NULL DEFAULT 'draft' CONSTRAINT store_products_product_status_check
    CHECK (product_status = ANY (ARRAY['draft','pending_review','active','hidden','sold_out','deleted','blocked'])),
  pickup_available boolean NOT NULL DEFAULT false,
  local_delivery_available boolean NOT NULL DEFAULT false,
  shipping_available boolean NOT NULL DEFAULT false,
  thumbnail_url text,
  images_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  admin_review_status text NOT NULL DEFAULT 'none' CONSTRAINT store_products_admin_review_status_check
    CHECK (admin_review_status = ANY (ARRAY['none','pending','approved','rejected'])),
  admin_review_memo text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  item_type text NOT NULL DEFAULT 'product',
  is_featured boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  options_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  menu_section_id uuid,
  track_inventory boolean NOT NULL DEFAULT false,
  discount_percent smallint,
  thumbnail_width integer,
  thumbnail_height integer,
  is_owner_recommended boolean NOT NULL DEFAULT false,
  is_representative boolean NOT NULL DEFAULT false,
  has_options boolean
);

CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER store_products_updated_at BEFORE UPDATE ON public.store_products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.store_orders (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_no text NOT NULL UNIQUE,
  buyer_user_id uuid NOT NULL,
  store_id uuid NOT NULL,
  total_amount bigint NOT NULL DEFAULT 0,
  discount_amount bigint NOT NULL DEFAULT 0,
  payment_amount bigint NOT NULL DEFAULT 0,
  payment_status text NOT NULL DEFAULT 'pending',
  order_status text NOT NULL DEFAULT 'pending',
  fulfillment_type text NOT NULL DEFAULT 'pickup',
  buyer_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  auto_complete_at timestamptz,
  buyer_phone text,
  delivery_fee_amount bigint NOT NULL DEFAULT 0,
  delivery_courier_label text,
  delivery_address_summary text,
  delivery_address_detail text,
  buyer_payment_method text,
  buyer_payment_method_detail text,
  external_delivery_provider text,
  external_delivery_order_id text,
  external_delivery_status text,
  external_delivery_meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  external_delivery_updated_at timestamptz,
  community_messenger_room_id uuid,
  estimated_prep_minutes integer,
  estimated_ready_at timestamptz,
  accepted_at timestamptz,
  admin_locked boolean NOT NULL DEFAULT false,
  admin_flagged boolean NOT NULL DEFAULT false,
  admin_note text,
  refund_approved_at timestamptz,
  refunded_at timestamptz,
  dispute_status text,
  sla_warning_level text,
  sla_warning_reason text,
  sla_warning_at timestamptz,
  needs_admin_attention boolean NOT NULL DEFAULT false,
  client_order_key text,
  delivery_region text,
  delivery_city text,
  checkout_prep_minutes integer,
  checkout_ride_minutes integer,
  checkout_eta_minutes integer,
  checkout_eta_computed_at timestamptz,
  delivery_user_address_id uuid,
  checkout_route_distance_meters integer,
  delivery_place_id text,
  delivery_formatted_address text,
  delivery_detail_address text,
  delivery_note text,
  delivery_latitude double precision,
  delivery_longitude double precision,
  checkout_straight_distance_meters integer,
  coupon_campaign_id uuid,
  user_coupon_id uuid,
  store_funded_amount numeric(12,2) NOT NULL DEFAULT 0,
  platform_funded_amount numeric(12,2) NOT NULL DEFAULT 0,
  commission_base_amount numeric(12,2),
  coupon_offer_title text,
  coupon_number text,
  gift_redemption_amount integer NOT NULL DEFAULT 0,
  amount_before_gift integer NOT NULL DEFAULT 0,
  checkout_store_latitude double precision,
  checkout_store_longitude double precision,
  checkout_serviceability_eligible boolean,
  checkout_serviceability_max_km double precision,
  checkout_serviceability_reason text
);
CREATE UNIQUE INDEX store_orders_buyer_client_order_key_uidx ON public.store_orders (buyer_user_id, client_order_key)
  WHERE ((client_order_key IS NOT NULL) AND (btrim(client_order_key) <> ''));

CREATE TABLE public.store_order_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id uuid NOT NULL,
  product_id uuid NOT NULL,
  product_title_snapshot text NOT NULL,
  price_snapshot bigint NOT NULL,
  qty integer NOT NULL,
  subtotal bigint NOT NULL,
  options_snapshot_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  base_price_snapshot integer,
  options_unit_delta_snapshot integer
);

CREATE TABLE public.store_order_item_options (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_item_id uuid NOT NULL,
  option_group_name_snapshot text NOT NULL,
  option_item_name_snapshot text NOT NULL,
  price_delta_snapshot integer NOT NULL DEFAULT 0,
  quantity integer NOT NULL DEFAULT 1,
  line_extra_total integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.store_order_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id uuid NOT NULL,
  store_id uuid NOT NULL,
  actor_user_id uuid,
  actor_role text NOT NULL,
  event_type text NOT NULL,
  from_status text,
  to_status text,
  message text,
  dedupe_key text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.store_order_stock_restore_claims (
  order_id uuid NOT NULL PRIMARY KEY,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'terminal_restore'
);

-- create_store_order_atomic 의 %ROWTYPE 선언 대상 (상품권 경로는 이 테스트에서 실행하지 않음)
CREATE TABLE public.gift_certificate_instances (
  id uuid, product_id uuid, store_id uuid, purchaser_user_id uuid, current_owner_user_id uuid,
  face_value integer, purchase_price integer, remaining_balance integer, status text, version integer,
  purchased_at timestamptz, last_transferred_at timestamptz, fully_redeemed_at timestamptz,
  cancelled_at timestamptz, created_at timestamptz, public_gift_number text, gift_scope text,
  purchase_discount_amount integer, discount_funding_party_snapshot text, platform_fee_rate_snapshot integer,
  valid_from date, valid_until date
);

-- get_store_menus_snapshot 의존
CREATE TABLE public.admin_settings (key text PRIMARY KEY, value_json jsonb);
CREATE TABLE public.store_favorites (id uuid DEFAULT gen_random_uuid(), store_id uuid, user_id uuid);
CREATE OR REPLACE FUNCTION public.get_store_popular_product_stats(p_store_id uuid, p_since timestamptz, p_limit integer)
RETURNS TABLE (product_id uuid, total_qty bigint, last_ordered_at timestamptz)
LANGUAGE sql STABLE AS $$
  SELECT NULL::uuid, 0::bigint, NULL::timestamptz WHERE false
$$;

-- 운영 원문 (pg_get_functiondef 2026-10-20)
CREATE OR REPLACE FUNCTION public.store_charged_delivery_fee_php(p_business_hours_json jsonb, p_items_subtotal numeric, p_fulfillment text)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_mode text;
  v_fee numeric;
  v_free_over numeric;
  v_fulfillment text := coalesce(nullif(btrim(p_fulfillment), ''), 'pickup');
  v_o jsonb := coalesce(p_business_hours_json, '{}'::jsonb);
BEGIN
  IF v_fulfillment IS DISTINCT FROM 'local_delivery' THEN
    RETURN 0;
  END IF;
  v_mode := lower(nullif(btrim(coalesce(v_o->>'delivery_fee_mode', v_o->>'deliveryFeeMode', '')), ''));
  BEGIN
    v_fee := round(coalesce((v_o->>'delivery_fee_php')::numeric, (v_o->>'deliveryFeePhp')::numeric));
  EXCEPTION WHEN others THEN
    v_fee := NULL;
  END;
  BEGIN
    v_free_over := (v_o->>'free_delivery_over_php')::numeric;
  EXCEPTION WHEN others THEN
    BEGIN
      v_free_over := (v_o->>'freeDeliveryOverPhp')::numeric;
    EXCEPTION WHEN others THEN
      v_free_over := NULL;
    END;
  END;
  IF v_mode IS NULL OR v_mode = '' THEN
    IF v_fee IS NOT NULL AND v_fee > 0 THEN
      v_mode := 'self';
    ELSIF nullif(btrim(coalesce(v_o->>'delivery_courier_label', v_o->>'deliveryCourierLabel', '')), '') IS NOT NULL THEN
      v_mode := 'courier';
    ELSIF v_fee = 0 THEN
      v_mode := 'self';
    ELSE
      v_mode := NULL;
    END IF;
  END IF;
  IF v_mode = 'courier' OR v_mode = 'self_free_promo' THEN
    RETURN 0;
  END IF;
  IF v_mode IS DISTINCT FROM 'self' THEN
    RETURN 0;
  END IF;
  v_fee := coalesce(v_fee, 0);
  IF v_fee < 0 THEN
    v_fee := 0;
  END IF;
  IF v_free_over IS NOT NULL AND v_free_over > 0 AND coalesce(p_items_subtotal, 0) >= v_free_over THEN
    RETURN 0;
  END IF;
  RETURN v_fee;
END;
$function$;

-- 기준 데이터 (마이그레이션 전 상태: 레거시 sold_out 행 1개 포함)
INSERT INTO public.stores (id, owner_user_id, store_name, slug, approval_status, is_visible, is_open)
VALUES ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'Iso Store', 'iso-store', 'approved', true, true);
INSERT INTO public.store_sales_permissions (store_id, allowed_to_sell, sales_status)
VALUES ('00000000-0000-0000-0000-0000000000a1', true, 'approved');
INSERT INTO public.store_menu_sections (id, store_id, name, is_hidden) VALUES
  ('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-0000000000a1', 'Visible', false),
  ('00000000-0000-0000-0000-00000000c002', '00000000-0000-0000-0000-0000000000a1', 'Hidden', true);
INSERT INTO public.store_products (id, store_id, title, price, product_status, track_inventory, stock_qty, menu_section_id)
VALUES ('00000000-0000-0000-0000-00000000d0ff', '00000000-0000-0000-0000-0000000000a1', 'Legacy sold out', 100, 'sold_out', true, 0,
        '00000000-0000-0000-0000-00000000c001');
