-- Final ND-3 isolated-DB WRITE regression fixture (order -> reject/cancel -> delivery -> refund -> ledger -> permissions).
-- NOT for Supabase projects. Runs on a throwaway local PostgreSQL 16 database only.
-- Runner: supabase/tests/isolated/final-e2e/run.sh <pg_host> <pg_port> [db]
--
-- Shapes copied from PRODUCTION catalog (read-only, 2026-10-21): pg_attribute/pg_attrdef (all columns, types,
-- defaults, NOT NULL), pg_constraint (pg_get_constraintdef: PK/UNIQUE/CHECK/FK), pg_index (every UNIQUE and every
-- partial UNIQUE index), pg_trigger (pg_get_triggerdef), pg_policies, has_table_privilege (anon/authenticated/
-- service_role), relrowsecurity. auth.uid()/auth.role() and internal.is_platform_admin()/is_admin_user() are the
-- production bodies (pg_get_functiondef) and read request.jwt.claims like Supabase.
--
-- Deliberate deviations (none touches a code path under test):
--   * FKs to tables outside this suite are omitted: stores.store_category_id/store_topic_id, store_fee_policies.topic_id,
--     store_orders.community_messenger_room_id, gift_certificate_products.application_id, store_products.category_id.
--   * stores.location_geog is gis.geography(Point,4326) in prod (PostGIS not installed here): plain text, no default.
--   * Non-unique performance indexes (btree/gin/gist, partial or not) are not created; all UNIQUE ones are.
--   * delivery_riders / admin_memberships / admin_settings: only the columns the policies/functions read.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN NOINHERIT; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN NOINHERIT; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS; END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS internal;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
GRANT USAGE ON SCHEMA auth, public, extensions TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA internal TO anon, authenticated, service_role;

-- prod auth.role() / auth.uid() (pg_get_functiondef, verbatim)
CREATE OR REPLACE FUNCTION auth.role()
 RETURNS text
 LANGUAGE sql
 STABLE
AS $function$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$function$;
CREATE OR REPLACE FUNCTION auth.uid()
 RETURNS uuid
 LANGUAGE sql
 STABLE
AS $function$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$function$;
GRANT EXECUTE ON FUNCTION auth.role(), auth.uid() TO anon, authenticated, service_role;

CREATE TABLE auth.users (id uuid PRIMARY KEY);

CREATE TABLE public.admin_memberships (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY, user_id uuid NOT NULL, role text NOT NULL, status text NOT NULL
);
CREATE TABLE public.admin_settings (
  key text NOT NULL PRIMARY KEY, value_json jsonb DEFAULT '{}'::jsonb NOT NULL, updated_at timestamptz DEFAULT now() NOT NULL,
  updated_by_admin_id uuid
);
CREATE TABLE public.delivery_riders (id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY, user_id uuid);

-- prod internal.is_admin_user() / internal.is_platform_admin() (verbatim)
CREATE OR REPLACE FUNCTION internal.is_admin_user()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ select exists (select 1 from public.admin_memberships m where m.user_id=auth.uid() and m.status='active' and m.role in ('admin','super_admin')) $function$;
CREATE OR REPLACE FUNCTION internal.is_platform_admin(check_uid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT check_uid IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.admin_memberships m
      WHERE m.user_id = check_uid
        AND m.status = 'active'
        AND m.role IN ('admin', 'super_admin')
    );
$function$;
GRANT EXECUTE ON FUNCTION internal.is_admin_user(), internal.is_platform_admin(uuid) TO anon, authenticated, service_role;

-- prod generate_gift_public_number() (verbatim; md5 checked in run.sh)
CREATE OR REPLACE FUNCTION public.generate_gift_public_number()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_bytes bytea := extensions.gen_random_bytes(10);
  v_out text := 'GFT-';
  i integer;
BEGIN
  FOR i IN 0..9 LOOP
    IF i = 5 THEN
      v_out := v_out || '-';
    END IF;
    v_out := v_out || substr(v_alphabet, (get_byte(v_bytes, i) % length(v_alphabet)) + 1, 1);
  END LOOP;
  RETURN v_out;
END;
$function$;

-- ---------------------------------------------------------------------------------------------- tables (prod columns)
CREATE TABLE public.stores (
  id uuid DEFAULT gen_random_uuid() NOT NULL, owner_user_id uuid NOT NULL, store_name text NOT NULL, slug text NOT NULL,
  business_type text, store_category_id uuid, description text, phone text, email text, website_url text, region text,
  city text, district text, address_line1 text, address_line2 text, lat double precision, lng double precision,
  business_hours_json jsonb DEFAULT '{}'::jsonb NOT NULL, profile_image_url text, cover_image_url text,
  gallery_images_json jsonb DEFAULT '[]'::jsonb NOT NULL, is_open boolean DEFAULT true NOT NULL,
  is_visible boolean DEFAULT false NOT NULL, approval_status text DEFAULT 'pending'::text NOT NULL,
  approved_at timestamptz, rejected_reason text, suspended_reason text, revision_note text,
  created_at timestamptz DEFAULT now() NOT NULL, updated_at timestamptz DEFAULT now() NOT NULL, kakao_id text,
  store_topic_id uuid, rating_avg numeric(3,2), review_count integer DEFAULT 0 NOT NULL,
  view_count integer DEFAULT 0 NOT NULL, favorite_count integer DEFAULT 0 NOT NULL,
  delivery_available boolean DEFAULT false NOT NULL, pickup_available boolean DEFAULT true NOT NULL,
  reservation_available boolean DEFAULT false NOT NULL, visit_available boolean DEFAULT true NOT NULL,
  is_featured boolean DEFAULT false NOT NULL, featured_start_at timestamptz, featured_end_at timestamptz,
  owner_can_edit_store_identity boolean DEFAULT false NOT NULL, order_alert_sound_url text, place_id text,
  formatted_address text, detail_address text, menu_sold_out_bottom boolean DEFAULT false NOT NULL,
  application_request_note text, application_address_book jsonb, point_balance integer DEFAULT 0 NOT NULL,
  point_commerce_blocked boolean DEFAULT false NOT NULL, point_block_reason text, point_warning_at timestamptz,
  messenger_voice_messages_enabled boolean DEFAULT true NOT NULL, messenger_voice_calls_enabled boolean DEFAULT true NOT NULL,
  messenger_video_calls_enabled boolean DEFAULT true NOT NULL, admin_internal_memo text DEFAULT ''::text NOT NULL,
  first_listed_at timestamptz, delivery_policy_version bigint DEFAULT 1 NOT NULL, discovery_schedule_state text,
  next_schedule_transition_at timestamptz, completed_orders_30d integer DEFAULT 0 NOT NULL, completed_orders_30d_at timestamptz,
  district_norm text GENERATED ALWAYS AS (lower(btrim(COALESCE(district, ''::text)))) STORED,
  location_geog text,
  delivery_radius_km double precision, delivery_service_area_authority text DEFAULT 'legacy_radius'::text NOT NULL,
  core_info_review_status text DEFAULT 'none'::text NOT NULL, core_info_changed_at timestamptz,
  core_info_changed_fields text[], core_info_verified_at timestamptz, core_info_verified_by uuid,
  CONSTRAINT stores_pkey PRIMARY KEY (id),
  CONSTRAINT stores_slug_key UNIQUE (slug),
  CONSTRAINT stores_approval_status_check CHECK ((approval_status = ANY (ARRAY['pending'::text, 'under_review'::text, 'revision_requested'::text, 'approved'::text, 'rejected'::text, 'suspended'::text]))),
  CONSTRAINT stores_completed_orders_30d_check CHECK ((completed_orders_30d >= 0)),
  CONSTRAINT stores_core_info_pending_has_changed_at CHECK (((core_info_review_status <> 'pending_reverification'::text) OR (core_info_changed_at IS NOT NULL))),
  CONSTRAINT stores_core_info_review_status_check CHECK ((core_info_review_status = ANY (ARRAY['none'::text, 'pending_reverification'::text]))),
  CONSTRAINT stores_delivery_policy_version_check CHECK ((delivery_policy_version >= 1)),
  CONSTRAINT stores_delivery_radius_km_positive CHECK (((delivery_radius_km IS NULL) OR (delivery_radius_km > (0)::double precision))),
  CONSTRAINT stores_delivery_service_area_authority_check CHECK ((delivery_service_area_authority = ANY (ARRAY['legacy_radius'::text, 'v2_lgu'::text]))),
  CONSTRAINT stores_discovery_schedule_state_check CHECK (((discovery_schedule_state IS NULL) OR (discovery_schedule_state = ANY (ARRAY['ORDERABLE'::text, 'IN_BREAK'::text, 'CLOSED'::text, 'PREPARING'::text, 'UNKNOWN'::text])))),
  CONSTRAINT stores_favorite_count_check CHECK ((favorite_count >= 0)),
  CONSTRAINT stores_review_count_check CHECK ((review_count >= 0)),
  CONSTRAINT stores_view_count_check CHECK ((view_count >= 0))
);
CREATE UNIQUE INDEX stores_one_owner_one_store_uidx ON public.stores USING btree (owner_user_id) WHERE (owner_user_id IS NOT NULL);

CREATE TABLE public.store_sales_permissions (
  id uuid DEFAULT gen_random_uuid() NOT NULL, store_id uuid NOT NULL, allowed_to_sell boolean DEFAULT false NOT NULL,
  sales_status text DEFAULT 'pending'::text NOT NULL, approved_at timestamptz, approved_by_admin_id uuid,
  rejection_reason text, suspension_reason text, settlement_account_name text, settlement_bank_name text,
  settlement_account_ref text, kyc_status text DEFAULT 'pending'::text NOT NULL, payout_hold_flag boolean DEFAULT false NOT NULL,
  payout_hold_reason text, seller_disclosure_json jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL, updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT store_sales_permissions_pkey PRIMARY KEY (id),
  CONSTRAINT store_sales_permissions_store_id_key UNIQUE (store_id),
  CONSTRAINT store_sales_permissions_kyc_status_check CHECK ((kyc_status = ANY (ARRAY['pending'::text, 'passed'::text, 'failed'::text, 'expired'::text]))),
  CONSTRAINT store_sales_permissions_sales_status_check CHECK ((sales_status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'suspended'::text]))),
  CONSTRAINT store_sales_permissions_approved_by_admin_id_fkey FOREIGN KEY (approved_by_admin_id) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT store_sales_permissions_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE
);

CREATE TABLE public.store_menu_sections (
  id uuid DEFAULT gen_random_uuid() NOT NULL, store_id uuid NOT NULL, name text NOT NULL, sort_order integer DEFAULT 0 NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL, updated_at timestamptz DEFAULT now() NOT NULL, description text,
  is_hidden boolean DEFAULT false NOT NULL,
  CONSTRAINT store_menu_sections_pkey PRIMARY KEY (id),
  CONSTRAINT store_menu_sections_store_id_name_key UNIQUE (store_id, name),
  CONSTRAINT store_menu_sections_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE
);

CREATE TABLE public.store_products (
  id uuid DEFAULT gen_random_uuid() NOT NULL, store_id uuid NOT NULL, category_id uuid, title text NOT NULL, summary text,
  description_html text, price bigint NOT NULL, discount_price bigint, stock_qty integer DEFAULT 0 NOT NULL,
  min_order_qty integer DEFAULT 1 NOT NULL, max_order_qty integer DEFAULT 99 NOT NULL,
  product_status text DEFAULT 'draft'::text NOT NULL, pickup_available boolean DEFAULT false NOT NULL,
  local_delivery_available boolean DEFAULT false NOT NULL, shipping_available boolean DEFAULT false NOT NULL,
  thumbnail_url text, images_json jsonb DEFAULT '[]'::jsonb NOT NULL, admin_review_status text DEFAULT 'none'::text NOT NULL,
  admin_review_memo text, created_at timestamptz DEFAULT now() NOT NULL, updated_at timestamptz DEFAULT now() NOT NULL,
  item_type text DEFAULT 'product'::text NOT NULL, is_featured boolean DEFAULT false NOT NULL, sort_order integer DEFAULT 0 NOT NULL,
  options_json jsonb DEFAULT '[]'::jsonb NOT NULL, menu_section_id uuid, track_inventory boolean DEFAULT false NOT NULL,
  discount_percent smallint, thumbnail_width integer, thumbnail_height integer,
  is_owner_recommended boolean DEFAULT false NOT NULL, is_representative boolean DEFAULT false NOT NULL,
  has_options boolean GENERATED ALWAYS AS (
CASE
    WHEN (options_json IS NULL) THEN false
    WHEN (jsonb_typeof(options_json) = 'array'::text) THEN (jsonb_array_length(options_json) > 0)
    ELSE false
END) STORED, sold_out_reason text, admin_status_lock text, client_request_id text,
  CONSTRAINT store_products_pkey PRIMARY KEY (id),
  CONSTRAINT store_products_admin_review_status_check CHECK ((admin_review_status = ANY (ARRAY['none'::text, 'pending'::text, 'approved'::text, 'rejected'::text]))),
  CONSTRAINT store_products_admin_status_lock_check CHECK (((admin_status_lock IS NULL) OR (admin_status_lock = ANY (ARRAY['hidden'::text, 'sold_out'::text, 'blocked'::text])))),
  CONSTRAINT store_products_check CHECK ((max_order_qty >= min_order_qty)),
  CONSTRAINT store_products_discount_lt_price CHECK (((discount_price IS NULL) OR (price = 0) OR (discount_price < price))),
  CONSTRAINT store_products_discount_percent_check CHECK (((discount_percent IS NULL) OR ((discount_percent >= 0) AND (discount_percent <= 100)))),
  CONSTRAINT store_products_discount_price_check CHECK (((discount_price IS NULL) OR (discount_price >= 0))),
  CONSTRAINT store_products_item_type_check CHECK ((item_type = ANY (ARRAY['product'::text, 'menu'::text, 'service'::text]))),
  CONSTRAINT store_products_min_order_qty_check CHECK ((min_order_qty >= 1)),
  CONSTRAINT store_products_price_check CHECK ((price >= 0)),
  CONSTRAINT store_products_product_status_check CHECK ((product_status = ANY (ARRAY['draft'::text, 'pending_review'::text, 'active'::text, 'hidden'::text, 'sold_out'::text, 'deleted'::text, 'blocked'::text]))),
  CONSTRAINT store_products_sold_out_reason_check CHECK (((sold_out_reason IS NULL) OR (sold_out_reason = ANY (ARRAY['stock'::text, 'manual'::text, 'admin'::text])))),
  CONSTRAINT store_products_stock_qty_check CHECK ((stock_qty >= 0)),
  CONSTRAINT store_products_menu_section_id_fkey FOREIGN KEY (menu_section_id) REFERENCES public.store_menu_sections(id) ON DELETE SET NULL,
  CONSTRAINT store_products_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX store_products_store_client_request_id_key ON public.store_products USING btree (store_id, client_request_id) WHERE (client_request_id IS NOT NULL);

CREATE TABLE public.store_coupon_campaigns (
  id uuid DEFAULT gen_random_uuid() NOT NULL, store_id uuid NOT NULL, title text NOT NULL, discount_type text NOT NULL,
  discount_value numeric(12,2) NOT NULL, min_order_amount numeric(12,2), terms_copy text, start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL, is_active boolean DEFAULT true NOT NULL, created_by_user_id uuid, updated_by_user_id uuid,
  created_at timestamptz DEFAULT now() NOT NULL, updated_at timestamptz DEFAULT now() NOT NULL,
  lifecycle_state text DEFAULT 'active'::text NOT NULL, funding_mode text DEFAULT 'STORE_FUNDED'::text NOT NULL,
  store_funded_amount numeric(12,2), issue_limit integer, issued_count integer DEFAULT 0 NOT NULL, spend_budget_php numeric(14,2),
  reserved_spend_php numeric(14,2) DEFAULT 0 NOT NULL, max_discount numeric(12,2), first_order_scope text,
  max_uses_per_user integer DEFAULT 1 NOT NULL, restore_on_full_refund boolean DEFAULT true NOT NULL,
  requires_admin_approval boolean DEFAULT false NOT NULL, usage_end_at timestamptz, claim_valid_days integer, issuer_role text,
  campaign_purpose text, paused_by text, source_campaign_id uuid, client_request_id text,
  CONSTRAINT store_coupon_campaigns_pkey PRIMARY KEY (id),
  CONSTRAINT store_coupon_campaigns_client_request_id_chk CHECK (((client_request_id IS NULL) OR ((length(client_request_id) >= 8) AND (length(client_request_id) <= 128)))),
  CONSTRAINT store_coupon_campaigns_discount_type_check CHECK ((discount_type = ANY (ARRAY['percent'::text, 'fixed_amount'::text]))),
  CONSTRAINT store_coupon_campaigns_discount_value_check CHECK ((discount_value > (0)::numeric)),
  CONSTRAINT store_coupon_campaigns_funding_mode_chk CHECK ((funding_mode = ANY (ARRAY['STORE_FUNDED'::text, 'PLATFORM_FUNDED'::text, 'SHARED_FUNDED'::text]))),
  CONSTRAINT store_coupon_campaigns_issuer_role_chk CHECK (((issuer_role IS NULL) OR (issuer_role = ANY (ARRAY['owner'::text, 'admin'::text, 'system'::text])))),
  CONSTRAINT store_coupon_campaigns_lifecycle_chk CHECK ((lifecycle_state = ANY (ARRAY['draft'::text, 'requested'::text, 'approved'::text, 'rejected'::text, 'scheduled'::text, 'active'::text, 'paused'::text, 'ended'::text, 'revoked'::text]))),
  CONSTRAINT store_coupon_campaigns_max_uses_one_chk CHECK ((max_uses_per_user = 1)) NOT VALID,
  CONSTRAINT store_coupon_campaigns_min_order_amount_check CHECK (((min_order_amount IS NULL) OR (min_order_amount >= (0)::numeric))),
  CONSTRAINT store_coupon_campaigns_paused_by_chk CHECK (((paused_by IS NULL) OR (paused_by = ANY (ARRAY['owner'::text, 'admin'::text])))),
  CONSTRAINT store_coupon_campaigns_purpose_chk CHECK (((campaign_purpose IS NULL) OR (campaign_purpose = ANY (ARRAY['new_customer_acquisition'::text, 'repeat_purchase'::text, 'new_menu_promotion'::text, 'store_promotion'::text, 'platform_event'::text])))),
  CONSTRAINT store_coupon_campaigns_window_chk CHECK ((end_at > start_at)),
  CONSTRAINT store_coupon_campaigns_source_campaign_fk FOREIGN KEY (source_campaign_id) REFERENCES public.store_coupon_campaigns(id) ON DELETE SET NULL,
  CONSTRAINT store_coupon_campaigns_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX store_coupon_campaigns_reissue_request_uidx ON public.store_coupon_campaigns USING btree (store_id, source_campaign_id, client_request_id) WHERE (client_request_id IS NOT NULL);

CREATE TABLE public.store_orders (
  id uuid DEFAULT gen_random_uuid() NOT NULL, order_no text NOT NULL, buyer_user_id uuid NOT NULL, store_id uuid NOT NULL,
  total_amount bigint DEFAULT 0 NOT NULL, discount_amount bigint DEFAULT 0 NOT NULL, payment_amount bigint DEFAULT 0 NOT NULL,
  payment_status text DEFAULT 'pending'::text NOT NULL, order_status text DEFAULT 'pending'::text NOT NULL,
  fulfillment_type text DEFAULT 'pickup'::text NOT NULL, buyer_note text, created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL, auto_complete_at timestamptz, buyer_phone text,
  delivery_fee_amount bigint DEFAULT 0 NOT NULL, delivery_courier_label text, delivery_address_summary text,
  delivery_address_detail text, buyer_payment_method text, buyer_payment_method_detail text, external_delivery_provider text,
  external_delivery_order_id text, external_delivery_status text, external_delivery_meta jsonb DEFAULT '{}'::jsonb NOT NULL,
  external_delivery_updated_at timestamptz, community_messenger_room_id uuid, estimated_prep_minutes integer,
  estimated_ready_at timestamptz, accepted_at timestamptz, admin_locked boolean DEFAULT false NOT NULL,
  admin_flagged boolean DEFAULT false NOT NULL, admin_note text, refund_approved_at timestamptz, refunded_at timestamptz,
  dispute_status text, sla_warning_level text, sla_warning_reason text, sla_warning_at timestamptz,
  needs_admin_attention boolean DEFAULT false NOT NULL, client_order_key text, delivery_region text, delivery_city text,
  checkout_prep_minutes integer, checkout_ride_minutes integer, checkout_eta_minutes integer, checkout_eta_computed_at timestamptz,
  delivery_user_address_id uuid, checkout_route_distance_meters integer, delivery_place_id text, delivery_formatted_address text,
  delivery_detail_address text, delivery_note text, delivery_latitude double precision, delivery_longitude double precision,
  checkout_straight_distance_meters integer, coupon_campaign_id uuid, user_coupon_id uuid,
  store_funded_amount numeric(12,2) DEFAULT 0 NOT NULL, platform_funded_amount numeric(12,2) DEFAULT 0 NOT NULL,
  commission_base_amount numeric(12,2), coupon_offer_title text, coupon_number text,
  gift_redemption_amount integer DEFAULT 0 NOT NULL, amount_before_gift integer DEFAULT 0 NOT NULL,
  checkout_store_latitude double precision, checkout_store_longitude double precision,
  checkout_serviceability_eligible boolean, checkout_serviceability_max_km double precision, checkout_serviceability_reason text,
  CONSTRAINT store_orders_pkey PRIMARY KEY (id),
  CONSTRAINT store_orders_order_no_key UNIQUE (order_no),
  CONSTRAINT store_orders_coupon_funding_split_check CHECK (((coupon_campaign_id IS NULL) OR (created_at < '2026-10-21 01:02:46+00'::timestamp with time zone) OR ((store_funded_amount + platform_funded_amount) = (discount_amount)::numeric))) NOT VALID,
  CONSTRAINT store_orders_fulfillment_type_check CHECK ((fulfillment_type = ANY (ARRAY['pickup'::text, 'local_delivery'::text, 'shipping'::text]))),
  CONSTRAINT store_orders_order_status_check CHECK ((order_status = ANY (ARRAY['pending'::text, 'accepted'::text, 'preparing'::text, 'ready_for_pickup'::text, 'delivering'::text, 'arrived'::text, 'completed'::text, 'cancel_requested'::text, 'cancelled'::text, 'refund_requested'::text, 'refunded'::text]))),
  CONSTRAINT store_orders_payment_status_check CHECK ((payment_status = ANY (ARRAY['pending'::text, 'paid'::text, 'failed'::text, 'cancelled'::text, 'refunded'::text]))),
  CONSTRAINT store_orders_coupon_campaign_id_fkey FOREIGN KEY (coupon_campaign_id) REFERENCES public.store_coupon_campaigns(id) ON DELETE SET NULL,
  CONSTRAINT store_orders_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX store_orders_buyer_client_order_key_uidx ON public.store_orders USING btree (buyer_user_id, client_order_key) WHERE ((client_order_key IS NOT NULL) AND (btrim(client_order_key) <> ''::text));

CREATE TABLE public.coupon_user_entitlements (
  id uuid DEFAULT gen_random_uuid() NOT NULL, campaign_id uuid NOT NULL, store_id uuid NOT NULL, buyer_user_id uuid NOT NULL,
  status text DEFAULT 'available'::text NOT NULL, reserved_php numeric(12,2) NOT NULL, expires_at timestamptz NOT NULL,
  redeemed_order_id uuid, created_at timestamptz DEFAULT now() NOT NULL, updated_at timestamptz DEFAULT now() NOT NULL,
  coupon_number text, offer_snapshot jsonb,
  CONSTRAINT coupon_user_entitlements_pkey PRIMARY KEY (id),
  CONSTRAINT coupon_user_entitlements_reserved_php_check CHECK ((reserved_php >= (0)::numeric)),
  CONSTRAINT coupon_user_entitlements_status_check CHECK ((status = ANY (ARRAY['available'::text, 'redeemed'::text, 'expired'::text, 'revoked'::text, 'restored'::text]))),
  CONSTRAINT coupon_user_entitlements_buyer_user_id_fkey FOREIGN KEY (buyer_user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT coupon_user_entitlements_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.store_coupon_campaigns(id) ON DELETE RESTRICT,
  CONSTRAINT coupon_user_entitlements_redeemed_order_id_fkey FOREIGN KEY (redeemed_order_id) REFERENCES public.store_orders(id) ON DELETE SET NULL,
  CONSTRAINT coupon_user_entitlements_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX coupon_user_entitlements_active_buyer_campaign_uidx ON public.coupon_user_entitlements USING btree (buyer_user_id, campaign_id) WHERE (status = ANY (ARRAY['available'::text, 'restored'::text]));
CREATE UNIQUE INDEX coupon_user_entitlements_coupon_number_uidx ON public.coupon_user_entitlements USING btree (coupon_number) WHERE (coupon_number IS NOT NULL);
ALTER TABLE public.store_orders ADD CONSTRAINT store_orders_user_coupon_id_fkey FOREIGN KEY (user_coupon_id) REFERENCES public.coupon_user_entitlements(id) ON DELETE SET NULL;

CREATE TABLE public.store_coupon_redemptions (
  id uuid DEFAULT gen_random_uuid() NOT NULL, campaign_id uuid NOT NULL, store_id uuid NOT NULL, buyer_user_id uuid NOT NULL,
  order_id uuid NOT NULL, discount_amount_applied numeric(12,2) NOT NULL, created_at timestamptz DEFAULT now() NOT NULL,
  user_coupon_id uuid, reversed_at timestamptz, reversed_reason text,
  CONSTRAINT store_coupon_redemptions_pkey PRIMARY KEY (id),
  CONSTRAINT store_coupon_redemptions_order_id_key UNIQUE (order_id),
  CONSTRAINT store_coupon_redemptions_discount_amount_applied_check CHECK ((discount_amount_applied > (0)::numeric)),
  CONSTRAINT store_coupon_redemptions_buyer_user_id_fkey FOREIGN KEY (buyer_user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT store_coupon_redemptions_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.store_coupon_campaigns(id) ON DELETE RESTRICT,
  CONSTRAINT store_coupon_redemptions_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.store_orders(id) ON DELETE RESTRICT,
  CONSTRAINT store_coupon_redemptions_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT,
  CONSTRAINT store_coupon_redemptions_user_coupon_id_fkey FOREIGN KEY (user_coupon_id) REFERENCES public.coupon_user_entitlements(id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX store_coupon_redemptions_buyer_campaign_active_uidx ON public.store_coupon_redemptions USING btree (buyer_user_id, campaign_id) WHERE (reversed_at IS NULL);
CREATE UNIQUE INDEX store_coupon_redemptions_user_coupon_uidx ON public.store_coupon_redemptions USING btree (user_coupon_id) WHERE ((user_coupon_id IS NOT NULL) AND (reversed_at IS NULL));

CREATE TABLE public.store_order_items (
  id uuid DEFAULT gen_random_uuid() NOT NULL, order_id uuid NOT NULL, product_id uuid NOT NULL, product_title_snapshot text NOT NULL,
  price_snapshot bigint NOT NULL, qty integer NOT NULL, subtotal bigint NOT NULL, options_snapshot_json jsonb DEFAULT '{}'::jsonb NOT NULL,
  base_price_snapshot integer, options_unit_delta_snapshot integer,
  CONSTRAINT store_order_items_pkey PRIMARY KEY (id),
  CONSTRAINT store_order_items_qty_check CHECK ((qty >= 1)),
  CONSTRAINT store_order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.store_orders(id) ON DELETE CASCADE,
  CONSTRAINT store_order_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.store_products(id) ON DELETE RESTRICT
);
CREATE TABLE public.store_order_item_options (
  id uuid DEFAULT gen_random_uuid() NOT NULL, order_item_id uuid NOT NULL, option_group_name_snapshot text NOT NULL,
  option_item_name_snapshot text NOT NULL, price_delta_snapshot integer DEFAULT 0 NOT NULL, quantity integer DEFAULT 1 NOT NULL,
  line_extra_total integer DEFAULT 0 NOT NULL, created_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT store_order_item_options_pkey PRIMARY KEY (id),
  CONSTRAINT store_order_item_options_order_item_id_fkey FOREIGN KEY (order_item_id) REFERENCES public.store_order_items(id) ON DELETE CASCADE
);
CREATE TABLE public.store_order_events (
  id uuid DEFAULT gen_random_uuid() NOT NULL, order_id uuid NOT NULL, store_id uuid NOT NULL, actor_user_id uuid,
  actor_role text NOT NULL, event_type text NOT NULL, from_status text, to_status text, message text, dedupe_key text,
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL, created_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT store_order_events_pkey PRIMARY KEY (id),
  CONSTRAINT store_order_events_actor_role_check CHECK ((actor_role = ANY (ARRAY['buyer'::text, 'owner'::text, 'rider'::text, 'admin'::text, 'system'::text]))),
  CONSTRAINT store_order_events_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.store_orders(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX store_order_events_dedupe_uidx ON public.store_order_events USING btree (dedupe_key) WHERE ((dedupe_key IS NOT NULL) AND (btrim(dedupe_key) <> ''::text));

CREATE TABLE public.store_payments (
  id uuid DEFAULT gen_random_uuid() NOT NULL, order_id uuid NOT NULL, provider text DEFAULT 'stub'::text NOT NULL,
  provider_payment_id text, amount bigint NOT NULL, status text DEFAULT 'pending'::text NOT NULL, meta jsonb,
  created_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT store_payments_pkey PRIMARY KEY (id),
  CONSTRAINT store_payments_order_id_key UNIQUE (order_id),
  CONSTRAINT store_payments_provider_payment_id_key UNIQUE (provider_payment_id),
  CONSTRAINT store_payments_amount_check CHECK ((amount >= 0)),
  CONSTRAINT store_payments_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'succeeded'::text, 'failed'::text, 'refunded'::text]))),
  CONSTRAINT store_payments_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.store_orders(id) ON DELETE RESTRICT
);

CREATE TABLE public.store_order_cancel_requests (
  id uuid DEFAULT gen_random_uuid() NOT NULL, order_id uuid NOT NULL, previous_order_status text, requested_by uuid,
  requested_role text NOT NULL, reason text DEFAULT ''::text NOT NULL, detail_reason text, status text DEFAULT 'pending'::text NOT NULL,
  approved_by uuid, approved_at timestamptz, rejected_at timestamptz, rejected_reason text,
  refund_status text DEFAULT 'not_started'::text NOT NULL, created_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT store_order_cancel_requests_pkey PRIMARY KEY (id),
  CONSTRAINT store_order_cancel_requests_refund_status_check CHECK ((refund_status = ANY (ARRAY['not_started'::text, 'pending'::text, 'refunded'::text, 'partial_refunded'::text, 'not_applicable'::text]))),
  CONSTRAINT store_order_cancel_requests_requested_role_check CHECK ((requested_role = ANY (ARRAY['buyer'::text, 'owner'::text, 'admin'::text, 'system'::text]))),
  CONSTRAINT store_order_cancel_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'refunded'::text, 'partial_refunded'::text]))),
  CONSTRAINT store_order_cancel_requests_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.store_orders(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX idx_store_order_cancel_requests_one_pending ON public.store_order_cancel_requests USING btree (order_id) WHERE (status = 'pending'::text);

CREATE TABLE public.store_order_deliveries (
  order_id uuid NOT NULL, store_id uuid NOT NULL, buyer_user_id uuid NOT NULL, rider_id uuid,
  delivery_status text DEFAULT 'waiting_rider'::text NOT NULL, assigned_at timestamptz, picked_up_at timestamptz,
  delivered_at timestamptz, admin_note text, created_at timestamptz DEFAULT now() NOT NULL, updated_at timestamptz DEFAULT now() NOT NULL,
  rider_accepted_at timestamptz, customer_arrived_at timestamptz, rider_decline_reason text, delivered_proof_image_url text,
  delivered_proof_note text, delivered_receiver_name text, delivered_confirmed_at timestamptz, delivered_proof_lat double precision,
  delivered_proof_lng double precision, failure_proof_image_url text, failure_note text, rider_failure_reported_at timestamptz,
  rider_failure_report_reason text, failure_report_lat double precision, failure_report_lng double precision, failed_at timestamptz,
  delivered_proof_image_path text, failure_proof_image_path text, failure_reason text,
  CONSTRAINT store_order_deliveries_pkey PRIMARY KEY (order_id),
  CONSTRAINT store_order_deliveries_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.store_orders(id) ON DELETE CASCADE,
  CONSTRAINT store_order_deliveries_rider_id_fkey FOREIGN KEY (rider_id) REFERENCES public.delivery_riders(id) ON DELETE SET NULL
);
ALTER TABLE public.store_order_deliveries ADD CONSTRAINT store_order_deliveries_status_check CHECK ((delivery_status = ANY (ARRAY['waiting_rider'::text, 'rider_assigned'::text, 'pickup_in_progress'::text, 'delivering'::text, 'delivered'::text, 'delivery_failed'::text]))) NOT VALID;

CREATE TABLE public.store_settlements (
  id uuid DEFAULT gen_random_uuid() NOT NULL, store_id uuid NOT NULL, order_id uuid NOT NULL, gross_amount bigint NOT NULL,
  fee_amount bigint NOT NULL, settlement_amount bigint NOT NULL, settlement_status text DEFAULT 'scheduled'::text NOT NULL,
  settlement_due_date date NOT NULL, paid_at timestamptz, hold_reason text, created_at timestamptz DEFAULT now() NOT NULL,
  platform_fee_percent numeric(5,2) DEFAULT 0 NOT NULL, platform_fee_amount integer DEFAULT 0 NOT NULL,
  fixed_fee_amount integer DEFAULT 0 NOT NULL, delivery_income_amount integer DEFAULT 0 NOT NULL,
  discount_burden_amount integer DEFAULT 0 NOT NULL, refund_amount integer DEFAULT 0 NOT NULL,
  net_settlement_amount integer DEFAULT 0 NOT NULL, applied_fee_policy_id uuid, applied_fee_policy_snapshot jsonb,
  payout_method text, payout_reference text, payout_confirmed_at timestamptz, payout_note text,
  commission_reversal_amount integer DEFAULT 0 NOT NULL,
  CONSTRAINT store_settlements_pkey PRIMARY KEY (id),
  CONSTRAINT store_settlements_order_id_key UNIQUE (order_id),
  CONSTRAINT store_settlements_fee_amount_check CHECK ((fee_amount >= 0)),
  CONSTRAINT store_settlements_gross_amount_check CHECK ((gross_amount >= 0)),
  CONSTRAINT store_settlements_settlement_status_check CHECK ((settlement_status = ANY (ARRAY['scheduled'::text, 'processing'::text, 'paid'::text, 'held'::text, 'cancelled'::text]))),
  CONSTRAINT store_settlements_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.store_orders(id) ON DELETE CASCADE,
  CONSTRAINT store_settlements_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT
);

CREATE TABLE public.store_fee_policies (
  id uuid DEFAULT gen_random_uuid() NOT NULL, policy_name text NOT NULL, store_id uuid, category_id uuid,
  fee_percent numeric(5,2) DEFAULT 0 NOT NULL, fixed_fee integer DEFAULT 0 NOT NULL, delivery_fee_mode text DEFAULT 'none'::text NOT NULL,
  delivery_fee_percent numeric(5,2) DEFAULT 0 NOT NULL, is_active boolean DEFAULT true NOT NULL, starts_at timestamptz,
  ends_at timestamptz, priority integer DEFAULT 100 NOT NULL, created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL, memo text, is_archived boolean DEFAULT false NOT NULL, archived_at timestamptz,
  archived_by uuid, archive_reason text, topic_id uuid,
  CONSTRAINT store_fee_policies_pkey PRIMARY KEY (id)
);
ALTER TABLE public.store_fee_policies ADD CONSTRAINT store_fee_policies_delivery_fee_mode_not_percent_chk CHECK ((delivery_fee_mode IS DISTINCT FROM 'percent'::text)) NOT VALID;

CREATE TABLE public.store_sale_fee_obligations (
  id uuid DEFAULT gen_random_uuid() NOT NULL, store_id uuid NOT NULL, order_id uuid NOT NULL, settlement_id uuid,
  confirmed_revenue_php integer NOT NULL, fee_due_minor bigint NOT NULL, fee_paid_minor bigint DEFAULT 0 NOT NULL,
  fee_outstanding_minor bigint NOT NULL, status text DEFAULT 'open'::text NOT NULL, idempotency_key text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL, settled_at timestamptz, charge_stage text DEFAULT 'completed'::text NOT NULL,
  fee_snapshot jsonb, adjustment_status text DEFAULT 'none'::text NOT NULL, adjustment_trigger text, review_flagged_at timestamptz,
  original_fee_due_minor bigint,
  CONSTRAINT store_sale_fee_obligations_pkey PRIMARY KEY (id),
  CONSTRAINT store_sale_fee_obligations_idem_uq UNIQUE (idempotency_key),
  CONSTRAINT store_sale_fee_obligations_order_uq UNIQUE (order_id),
  CONSTRAINT store_sale_fee_obligations_adjustment_status_chk CHECK ((adjustment_status = ANY (ARRAY['none'::text, 'review_required'::text, 'refunded'::text, 'kept'::text]))),
  CONSTRAINT store_sale_fee_obligations_adjustment_trigger_chk CHECK (((adjustment_trigger IS NULL) OR (adjustment_trigger = ANY (ARRAY['cancelled'::text, 'refunded'::text])))),
  CONSTRAINT store_sale_fee_obligations_amounts_chk CHECK (((fee_paid_minor + fee_outstanding_minor) = fee_due_minor)),
  CONSTRAINT store_sale_fee_obligations_charge_stage_chk CHECK ((charge_stage = ANY (ARRAY['preparing'::text, 'ready_for_pickup'::text, 'delivering'::text, 'arrived'::text, 'completed'::text]))),
  CONSTRAINT store_sale_fee_obligations_confirmed_revenue_php_check CHECK ((confirmed_revenue_php >= 0)),
  CONSTRAINT store_sale_fee_obligations_fee_due_minor_check CHECK ((fee_due_minor >= 0)),
  CONSTRAINT store_sale_fee_obligations_fee_outstanding_minor_check CHECK ((fee_outstanding_minor >= 0)),
  CONSTRAINT store_sale_fee_obligations_fee_paid_minor_check CHECK ((fee_paid_minor >= 0)),
  CONSTRAINT store_sale_fee_obligations_original_chk CHECK (((original_fee_due_minor IS NULL) OR (original_fee_due_minor >= fee_due_minor))),
  CONSTRAINT store_sale_fee_obligations_status_check CHECK ((status = ANY (ARRAY['open'::text, 'settled'::text, 'waived'::text]))),
  CONSTRAINT store_sale_fee_obligations_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.store_orders(id) ON DELETE RESTRICT,
  CONSTRAINT store_sale_fee_obligations_settlement_id_fkey FOREIGN KEY (settlement_id) REFERENCES public.store_settlements(id) ON DELETE SET NULL,
  CONSTRAINT store_sale_fee_obligations_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT
);

CREATE TABLE public.business_cash_accounts (
  store_id uuid NOT NULL, balance_minor bigint DEFAULT 0 NOT NULL, updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT business_cash_accounts_pkey PRIMARY KEY (store_id),
  CONSTRAINT business_cash_accounts_balance_nonneg_chk CHECK ((balance_minor >= 0)),
  CONSTRAINT business_cash_accounts_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT
);
CREATE TABLE public.business_cash_ledger (
  id uuid DEFAULT gen_random_uuid() NOT NULL, store_id uuid NOT NULL, entry_kind text NOT NULL, direction text NOT NULL,
  amount_minor bigint NOT NULL, balance_after_minor bigint NOT NULL, related_type text DEFAULT ''::text NOT NULL,
  related_id text DEFAULT ''::text NOT NULL, idempotency_key text NOT NULL, actor_type text DEFAULT 'system'::text NOT NULL,
  actor_user_id uuid, meta jsonb DEFAULT '{}'::jsonb NOT NULL, created_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT business_cash_ledger_pkey PRIMARY KEY (id),
  CONSTRAINT business_cash_ledger_idem_uidx UNIQUE (idempotency_key),
  CONSTRAINT business_cash_ledger_amount_minor_check CHECK ((amount_minor > 0)),
  CONSTRAINT business_cash_ledger_direction_check CHECK ((direction = ANY (ARRAY['credit'::text, 'debit'::text]))),
  CONSTRAINT business_cash_ledger_entry_kind_check CHECK ((entry_kind = ANY (ARRAY['TOP_UP'::text, 'CONVERT_FROM_STORE_POINTS'::text, 'AD_SPEND'::text, 'AD_REFUND'::text, 'PARTNER_SPEND'::text, 'PARTNER_REFUND'::text, 'SALE_FEE'::text, 'SALE_FEE_SETTLEMENT'::text, 'SALE_FEE_REVERSAL'::text, 'ADMIN_ADJUST'::text, 'SYSTEM'::text]))),
  CONSTRAINT business_cash_ledger_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT
);

CREATE TABLE public.store_economic_point_accounts (
  store_id uuid NOT NULL, balance integer DEFAULT 0 NOT NULL, updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT store_economic_point_accounts_pkey PRIMARY KEY (store_id),
  CONSTRAINT store_economic_point_accounts_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT
);
CREATE TABLE public.store_economic_point_ledger (
  id uuid DEFAULT gen_random_uuid() NOT NULL, store_id uuid NOT NULL, entry_kind text NOT NULL, amount integer NOT NULL,
  balance_after integer NOT NULL, related_type text DEFAULT ''::text NOT NULL, related_id text DEFAULT ''::text NOT NULL,
  idempotency_key text NOT NULL, actor_type text DEFAULT 'system'::text NOT NULL, actor_user_id uuid,
  meta jsonb DEFAULT '{}'::jsonb NOT NULL, created_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT store_economic_point_ledger_pkey PRIMARY KEY (id),
  CONSTRAINT store_economic_point_ledger_idem_uidx UNIQUE (idempotency_key),
  CONSTRAINT store_economic_point_ledger_entry_kind_check CHECK ((entry_kind = ANY (ARRAY['ECONOMIC_INFLOW'::text, 'SALE_EARN'::text, 'GIFT_REDEMPTION_EARN'::text, 'REVERSAL'::text, 'CONVERT_TO_BUSINESS_CASH'::text, 'WITHDRAWAL'::text, 'WITHDRAWAL_REQUEST'::text, 'WITHDRAWAL_COMPLETE'::text, 'WITHDRAWAL_REJECT'::text, 'WITHDRAWAL_RELEASE'::text, 'ADMIN_ADJUST'::text, 'SYSTEM'::text]))),
  CONSTRAINT store_economic_point_ledger_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT
);

CREATE TABLE public.admin_notification_outbox (
  id uuid DEFAULT gen_random_uuid() NOT NULL, source_key text NOT NULL, kind text NOT NULL, payload jsonb NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL, attempts integer DEFAULT 0 NOT NULL, max_attempts integer DEFAULT 8 NOT NULL,
  last_error text, next_attempt_at timestamptz DEFAULT now() NOT NULL, claim_token uuid, claimed_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL, updated_at timestamptz DEFAULT now() NOT NULL, delivered_at timestamptz,
  CONSTRAINT admin_notification_outbox_pkey PRIMARY KEY (id),
  CONSTRAINT admin_notification_outbox_source_key UNIQUE (source_key),
  CONSTRAINT admin_notification_outbox_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'delivered'::text, 'dead'::text])))
);

CREATE TABLE public.gift_certificate_products (
  id uuid DEFAULT gen_random_uuid() NOT NULL, store_id uuid, application_id uuid, title text NOT NULL, face_value integer NOT NULL,
  purchase_price integer NOT NULL, platform_fee_rate integer DEFAULT 0 NOT NULL, discount_funding_party text DEFAULT 'NONE'::text NOT NULL,
  platform_funded_units integer DEFAULT 0 NOT NULL, merchant_funded_units integer DEFAULT 0 NOT NULL,
  transferable boolean DEFAULT true NOT NULL, sales_starts_at timestamptz DEFAULT now() NOT NULL, sales_ends_at timestamptz,
  active boolean DEFAULT true NOT NULL, image_url text, created_by_admin_user_id uuid, fee_policy_version integer DEFAULT 1 NOT NULL,
  max_issuance integer, issued_count integer DEFAULT 0 NOT NULL, created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL, gift_scope text DEFAULT 'STORE'::text NOT NULL, creation_source text,
  archived_at timestamptz, expiry_policy text DEFAULT 'NO_EXPIRY'::text NOT NULL, validity_days integer, fixed_valid_until date,
  mall_visible boolean DEFAULT true NOT NULL,
  CONSTRAINT gift_certificate_products_pkey PRIMARY KEY (id),
  CONSTRAINT gift_certificate_products_creation_source_chk CHECK (((creation_source IS NULL) OR (creation_source = ANY (ARRAY['OWNER_APPLICATION'::text, 'ADMIN_DIRECT_STORE'::text, 'ADMIN_DIRECT_PLATFORM'::text])))),
  CONSTRAINT gift_certificate_products_discount_funding_party_check CHECK ((discount_funding_party = ANY (ARRAY['NONE'::text, 'PLATFORM'::text, 'MERCHANT'::text, 'SHARED'::text]))),
  CONSTRAINT gift_certificate_products_expiry_fields_chk CHECK ((((expiry_policy = 'NO_EXPIRY'::text) AND (validity_days IS NULL) AND (fixed_valid_until IS NULL)) OR ((expiry_policy = 'FIXED_DAYS'::text) AND (validity_days IS NOT NULL) AND (validity_days > 0) AND (fixed_valid_until IS NULL)) OR ((expiry_policy = 'FIXED_DATE'::text) AND (fixed_valid_until IS NOT NULL) AND (validity_days IS NULL)))),
  CONSTRAINT gift_certificate_products_expiry_policy_chk CHECK ((expiry_policy = ANY (ARRAY['FIXED_DAYS'::text, 'FIXED_DATE'::text, 'NO_EXPIRY'::text]))),
  CONSTRAINT gift_certificate_products_face_value_check CHECK ((face_value > 0)),
  CONSTRAINT gift_certificate_products_funding_chk CHECK ((((purchase_price = face_value) AND (discount_funding_party = 'NONE'::text) AND (platform_funded_units = 0) AND (merchant_funded_units = 0)) OR ((purchase_price < face_value) AND (discount_funding_party <> 'NONE'::text) AND (((discount_funding_party = 'PLATFORM'::text) AND (platform_funded_units = (face_value - purchase_price)) AND (merchant_funded_units = 0)) OR ((discount_funding_party = 'MERCHANT'::text) AND (merchant_funded_units = (face_value - purchase_price)) AND (platform_funded_units = 0)) OR ((discount_funding_party = 'SHARED'::text) AND ((platform_funded_units + merchant_funded_units) = (face_value - purchase_price))))))),
  CONSTRAINT gift_certificate_products_gift_scope_chk CHECK ((gift_scope = ANY (ARRAY['STORE'::text, 'PLATFORM'::text]))),
  CONSTRAINT gift_certificate_products_issued_count_check CHECK ((issued_count >= 0)),
  CONSTRAINT gift_certificate_products_max_issuance_check CHECK (((max_issuance IS NULL) OR (max_issuance > 0))),
  CONSTRAINT gift_certificate_products_merchant_funded_units_check CHECK ((merchant_funded_units >= 0)),
  CONSTRAINT gift_certificate_products_platform_fee_rate_check CHECK (((platform_fee_rate >= 0) AND (platform_fee_rate <= 100))),
  CONSTRAINT gift_certificate_products_platform_funded_units_check CHECK ((platform_funded_units >= 0)),
  CONSTRAINT gift_certificate_products_price_lte_face_chk CHECK ((purchase_price <= face_value)),
  CONSTRAINT gift_certificate_products_purchase_price_check CHECK ((purchase_price >= 0)),
  CONSTRAINT gift_certificate_products_scope_store_chk CHECK ((((gift_scope = 'STORE'::text) AND (store_id IS NOT NULL)) OR ((gift_scope = 'PLATFORM'::text) AND (store_id IS NULL)))),
  CONSTRAINT gift_certificate_products_created_by_admin_user_id_fkey FOREIGN KEY (created_by_admin_user_id) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT gift_certificate_products_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT
);

CREATE TABLE public.gift_certificate_instances (
  id uuid DEFAULT gen_random_uuid() NOT NULL, product_id uuid NOT NULL, store_id uuid, purchaser_user_id uuid NOT NULL,
  current_owner_user_id uuid NOT NULL, face_value integer NOT NULL, purchase_price integer NOT NULL, remaining_balance integer NOT NULL,
  status text DEFAULT 'ACTIVE'::text NOT NULL, version integer DEFAULT 1 NOT NULL, purchased_at timestamptz DEFAULT now() NOT NULL,
  last_transferred_at timestamptz, fully_redeemed_at timestamptz, cancelled_at timestamptz, created_at timestamptz DEFAULT now() NOT NULL,
  public_gift_number text DEFAULT public.generate_gift_public_number() NOT NULL, gift_scope text DEFAULT 'STORE'::text NOT NULL,
  purchase_discount_amount integer DEFAULT 0 NOT NULL, discount_funding_party_snapshot text DEFAULT 'UNKNOWN_LEGACY'::text NOT NULL,
  platform_fee_rate_snapshot integer DEFAULT 0 NOT NULL, valid_from date NOT NULL, valid_until date,
  CONSTRAINT gift_certificate_instances_pkey PRIMARY KEY (id),
  CONSTRAINT gift_certificate_instances_face_value_check CHECK ((face_value > 0)),
  CONSTRAINT gift_certificate_instances_funding_snapshot_check CHECK ((discount_funding_party_snapshot = ANY (ARRAY['NONE'::text, 'PLATFORM'::text, 'MERCHANT'::text, 'SHARED'::text, 'UNKNOWN_LEGACY'::text]))),
  CONSTRAINT gift_certificate_instances_gift_scope_chk CHECK ((gift_scope = ANY (ARRAY['STORE'::text, 'PLATFORM'::text]))),
  CONSTRAINT gift_certificate_instances_public_number_format_chk CHECK ((public_gift_number ~ '^GFT-[A-Z2-9]{5}-[A-Z2-9]{5}$'::text)),
  CONSTRAINT gift_certificate_instances_purchase_price_check CHECK ((purchase_price >= 0)),
  CONSTRAINT gift_certificate_instances_remaining_balance_check CHECK ((remaining_balance >= 0)),
  CONSTRAINT gift_certificate_instances_remaining_lte_face_chk CHECK ((remaining_balance <= face_value)),
  CONSTRAINT gift_certificate_instances_scope_store_chk CHECK ((((gift_scope = 'STORE'::text) AND (store_id IS NOT NULL)) OR ((gift_scope = 'PLATFORM'::text) AND (store_id IS NULL)))),
  CONSTRAINT gift_certificate_instances_status_check CHECK ((status = ANY (ARRAY['ACTIVE'::text, 'GIFT_LOCKED'::text, 'PARTIALLY_REDEEMED'::text, 'FULLY_REDEEMED'::text, 'SUSPENDED'::text]))),
  CONSTRAINT gift_certificate_instances_validity_range_chk CHECK (((valid_until IS NULL) OR (valid_until >= valid_from))),
  CONSTRAINT gift_certificate_instances_version_check CHECK ((version >= 1)),
  CONSTRAINT gift_certificate_instances_current_owner_user_id_fkey FOREIGN KEY (current_owner_user_id) REFERENCES auth.users(id) ON DELETE RESTRICT,
  CONSTRAINT gift_certificate_instances_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.gift_certificate_products(id) ON DELETE RESTRICT,
  CONSTRAINT gift_certificate_instances_purchaser_user_id_fkey FOREIGN KEY (purchaser_user_id) REFERENCES auth.users(id) ON DELETE RESTRICT,
  CONSTRAINT gift_certificate_instances_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX gift_certificate_instances_public_number_uq ON public.gift_certificate_instances USING btree (public_gift_number);

CREATE TABLE public.gift_certificate_redemptions (
  id uuid DEFAULT gen_random_uuid() NOT NULL, order_id uuid NOT NULL, instance_id uuid NOT NULL, store_id uuid NOT NULL,
  buyer_user_id uuid NOT NULL, redeemed_amount integer NOT NULL, platform_fee_amount integer NOT NULL,
  merchant_net_amount integer NOT NULL, platform_fee_rate_snapshot integer NOT NULL, reversed boolean DEFAULT false NOT NULL,
  idempotency_key text NOT NULL, created_at timestamptz DEFAULT now() NOT NULL, reversed_at timestamptz,
  forfeited_amount integer DEFAULT 0 NOT NULL,
  CONSTRAINT gift_certificate_redemptions_pkey PRIMARY KEY (id),
  CONSTRAINT gift_certificate_redemptions_idempotency_uq UNIQUE (idempotency_key),
  CONSTRAINT gift_certificate_redemptions_fee_split_chk CHECK (((platform_fee_amount + merchant_net_amount) = redeemed_amount)),
  CONSTRAINT gift_certificate_redemptions_forfeited_amount_check CHECK ((forfeited_amount >= 0)),
  CONSTRAINT gift_certificate_redemptions_merchant_net_amount_check CHECK ((merchant_net_amount >= 0)),
  CONSTRAINT gift_certificate_redemptions_platform_fee_amount_check CHECK ((platform_fee_amount >= 0)),
  CONSTRAINT gift_certificate_redemptions_platform_fee_rate_snapshot_check CHECK (((platform_fee_rate_snapshot >= 0) AND (platform_fee_rate_snapshot <= 100))),
  CONSTRAINT gift_certificate_redemptions_redeemed_amount_check CHECK ((redeemed_amount > 0)),
  CONSTRAINT gift_certificate_redemptions_buyer_user_id_fkey FOREIGN KEY (buyer_user_id) REFERENCES auth.users(id) ON DELETE RESTRICT,
  CONSTRAINT gift_certificate_redemptions_instance_id_fkey FOREIGN KEY (instance_id) REFERENCES public.gift_certificate_instances(id) ON DELETE RESTRICT,
  CONSTRAINT gift_certificate_redemptions_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.store_orders(id) ON DELETE RESTRICT,
  CONSTRAINT gift_certificate_redemptions_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT
);

CREATE TABLE public.gift_certificate_ledger (
  id uuid DEFAULT gen_random_uuid() NOT NULL, instance_id uuid, store_id uuid, user_id uuid, entry_type text NOT NULL,
  amount integer NOT NULL, related_type text DEFAULT ''::text NOT NULL, related_id text DEFAULT ''::text NOT NULL,
  description text DEFAULT ''::text NOT NULL, actor_type text DEFAULT 'system'::text NOT NULL, created_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT gift_certificate_ledger_pkey PRIMARY KEY (id),
  CONSTRAINT gift_certificate_ledger_related_entry_uq UNIQUE (related_type, related_id, entry_type),
  CONSTRAINT gift_certificate_ledger_instance_id_fkey FOREIGN KEY (instance_id) REFERENCES public.gift_certificate_instances(id) ON DELETE SET NULL,
  CONSTRAINT gift_certificate_ledger_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE SET NULL,
  CONSTRAINT gift_certificate_ledger_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TABLE public.gift_certificate_revenue_ledger (
  id uuid DEFAULT gen_random_uuid() NOT NULL, store_id uuid NOT NULL, redemption_id uuid, entry_type text NOT NULL,
  amount integer NOT NULL, related_type text DEFAULT ''::text NOT NULL, related_id text DEFAULT ''::text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT gift_certificate_revenue_ledger_pkey PRIMARY KEY (id),
  CONSTRAINT gift_certificate_revenue_ledger_related_entry_uq UNIQUE (related_type, related_id, entry_type),
  CONSTRAINT gift_certificate_revenue_ledger_redemption_id_fkey FOREIGN KEY (redemption_id) REFERENCES public.gift_certificate_redemptions(id) ON DELETE SET NULL,
  CONSTRAINT gift_certificate_revenue_ledger_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT
);

CREATE TABLE public.gift_promo_obligations (
  id uuid DEFAULT gen_random_uuid() NOT NULL, instance_id uuid NOT NULL, store_id uuid, party text NOT NULL,
  contracted_amount integer NOT NULL, recognized_amount integer DEFAULT 0 NOT NULL, settled_amount integer DEFAULT 0 NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL, updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT gift_promo_obligations_pkey PRIMARY KEY (id),
  CONSTRAINT gift_promo_obligations_instance_id_party_key UNIQUE (instance_id, party),
  CONSTRAINT gift_promo_obligations_check CHECK ((recognized_amount <= contracted_amount)),
  CONSTRAINT gift_promo_obligations_check1 CHECK ((settled_amount <= recognized_amount)),
  CONSTRAINT gift_promo_obligations_contracted_amount_check CHECK ((contracted_amount >= 0)),
  CONSTRAINT gift_promo_obligations_party_check CHECK ((party = ANY (ARRAY['OWNER'::text, 'DIBAY'::text]))),
  CONSTRAINT gift_promo_obligations_recognized_amount_check CHECK ((recognized_amount >= 0)),
  CONSTRAINT gift_promo_obligations_settled_amount_check CHECK ((settled_amount >= 0)),
  CONSTRAINT gift_promo_obligations_instance_id_fkey FOREIGN KEY (instance_id) REFERENCES public.gift_certificate_instances(id) ON DELETE CASCADE,
  CONSTRAINT gift_promo_obligations_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id)
);
CREATE TABLE public.gift_promo_ledger (
  id uuid DEFAULT gen_random_uuid() NOT NULL, instance_id uuid NOT NULL, obligation_id uuid NOT NULL, redemption_id uuid,
  order_id uuid, store_id uuid, party text NOT NULL, entry_type text NOT NULL, amount integer NOT NULL, related_type text NOT NULL,
  related_id text NOT NULL, description text, created_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT gift_promo_ledger_pkey PRIMARY KEY (id),
  CONSTRAINT gift_promo_ledger_related_type_related_id_entry_type_key UNIQUE (related_type, related_id, entry_type),
  CONSTRAINT gift_promo_ledger_entry_type_check CHECK ((entry_type = ANY (ARRAY['PROMO_ACCRUAL'::text, 'PROMO_RECOGNITION'::text, 'PROMO_SETTLEMENT'::text, 'PROMO_REVERSAL'::text]))),
  CONSTRAINT gift_promo_ledger_party_check CHECK ((party = ANY (ARRAY['OWNER'::text, 'DIBAY'::text]))),
  CONSTRAINT gift_promo_ledger_instance_id_fkey FOREIGN KEY (instance_id) REFERENCES public.gift_certificate_instances(id) ON DELETE CASCADE,
  CONSTRAINT gift_promo_ledger_obligation_id_fkey FOREIGN KEY (obligation_id) REFERENCES public.gift_promo_obligations(id) ON DELETE CASCADE,
  CONSTRAINT gift_promo_ledger_redemption_id_fkey FOREIGN KEY (redemption_id) REFERENCES public.gift_certificate_redemptions(id)
);
