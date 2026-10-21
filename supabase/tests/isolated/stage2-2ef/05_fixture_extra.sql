-- 2-E/2-F 격리 DB 추가 픽스처 (운영 분리 로컬 PostgreSQL 16 전용 — 운영/테스트 Supabase 프로젝트에 실행 금지)
-- 전제: supabase/tests/isolated/store-products-1j/00_fixture.sql + 20270602130000 적용 상태 (= 운영 기준 원문).
-- 컬럼 정의는 운영 information_schema / pg_get_functiondef 읽기 전용 조회(2026-10-20)에서 복사.
-- 쿠폰·상품권·캐시 게이트·레거시 정산 테이블만 추가한다.

-- ── 쿠폰 ──────────────────────────────────────────────────────
CREATE TABLE public.store_coupon_campaigns (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id uuid NOT NULL,
  title text NOT NULL DEFAULT 'c',
  discount_type text NOT NULL CHECK (discount_type = ANY (ARRAY['percent','fixed_amount'])),
  discount_value numeric NOT NULL CHECK (discount_value > 0),
  min_order_amount numeric,
  start_at timestamptz NOT NULL DEFAULT now() - interval '1 day',
  end_at timestamptz NOT NULL DEFAULT now() + interval '30 day',
  is_active boolean NOT NULL DEFAULT true,
  lifecycle_state text NOT NULL DEFAULT 'active',
  funding_mode text NOT NULL DEFAULT 'STORE_FUNDED'
    CONSTRAINT store_coupon_campaigns_funding_mode_chk
    CHECK (funding_mode = ANY (ARRAY['STORE_FUNDED','PLATFORM_FUNDED','SHARED_FUNDED'])),
  store_funded_amount numeric,
  reserved_spend_php numeric NOT NULL DEFAULT 0,
  max_discount numeric
);

CREATE TABLE public.coupon_user_entitlements (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id uuid NOT NULL,
  store_id uuid NOT NULL,
  buyer_user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'available',
  reserved_php numeric NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '30 day',
  redeemed_order_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  coupon_number text,
  offer_snapshot jsonb
);

CREATE TABLE public.store_coupon_redemptions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id uuid NOT NULL,
  store_id uuid NOT NULL,
  buyer_user_id uuid NOT NULL,
  order_id uuid NOT NULL,
  discount_amount_applied numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  user_coupon_id uuid
);

-- ── 상품권 (운영 원문 함수 3개) ────────────────────────────────
CREATE TABLE public.gift_certificate_products (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id uuid,
  title text NOT NULL DEFAULT 'g',
  face_value integer NOT NULL,
  purchase_price integer NOT NULL,
  platform_fee_rate integer NOT NULL DEFAULT 0
);
CREATE TABLE public.gift_certificate_redemptions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id uuid NOT NULL, instance_id uuid NOT NULL, store_id uuid NOT NULL, buyer_user_id uuid NOT NULL,
  redeemed_amount integer NOT NULL, platform_fee_amount integer NOT NULL, merchant_net_amount integer NOT NULL,
  platform_fee_rate_snapshot integer NOT NULL, reversed boolean NOT NULL DEFAULT false,
  idempotency_key text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), reversed_at timestamptz,
  forfeited_amount integer NOT NULL DEFAULT 0
);
CREATE TABLE public.gift_certificate_ledger (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  instance_id uuid, store_id uuid, user_id uuid, entry_type text NOT NULL, amount integer NOT NULL,
  related_type text NOT NULL DEFAULT '', related_id text NOT NULL DEFAULT '', description text NOT NULL DEFAULT '',
  actor_type text NOT NULL DEFAULT 'system', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.gift_certificate_revenue_ledger (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id uuid NOT NULL, redemption_id uuid, entry_type text NOT NULL, amount integer NOT NULL,
  related_type text NOT NULL DEFAULT '', related_id text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.gift_certificate_issue_date(p_at timestamp with time zone DEFAULT now())
 RETURNS date LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
  SELECT (coalesce(p_at, now()) AT TIME ZONE 'Asia/Manila')::date;
$function$;
CREATE OR REPLACE FUNCTION public.gift_certificate_instance_is_expired(p_valid_until date)
 RETURNS boolean LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
  SELECT p_valid_until IS NOT NULL
     AND p_valid_until < public.gift_certificate_issue_date(now());
$function$;
CREATE OR REPLACE FUNCTION public.gift_certificate_instance_allows_checkout_store(p_gift_scope text, p_instance_store_id uuid, p_checkout_store_id uuid)
 RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN p_checkout_store_id IS NULL THEN false
    WHEN coalesce(p_gift_scope, 'STORE') = 'STORE' THEN
      p_instance_store_id IS NOT NULL AND p_instance_store_id IS NOT DISTINCT FROM p_checkout_store_id
    WHEN coalesce(p_gift_scope, 'STORE') = 'PLATFORM' THEN
      true
    ELSE false
  END;
$function$;

-- ── 캐시 주문 게이트 (트리거 함수 = 운영 원문 · 모드/잔액은 테스트 스텁) ──
CREATE TABLE public.t_cash_position (store_id uuid PRIMARY KEY, orderable boolean NOT NULL, net_minor bigint NOT NULL DEFAULT 0);
CREATE OR REPLACE FUNCTION public.store_cash_order_gate_mode() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('test.cash_gate', true), ''), 'off')
$$;
CREATE OR REPLACE FUNCTION public.store_cash_position(p_store_id uuid) RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    (SELECT jsonb_build_object('orderable', orderable, 'net_minor', net_minor) FROM public.t_cash_position WHERE store_id = p_store_id),
    '{"orderable": true, "net_minor": 0}'::jsonb)
$$;
CREATE OR REPLACE FUNCTION public.store_orders_enforce_cash_order_gate()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pos jsonb;
BEGIN
  IF public.store_cash_order_gate_mode() = 'off' THEN
    RETURN NEW;
  END IF;
  v_pos := public.store_cash_position(NEW.store_id);
  IF coalesce((v_pos->>'orderable')::boolean, true) IS NOT TRUE THEN
    RAISE EXCEPTION 'store_cash_insufficient'
      USING ERRCODE = 'P0001', DETAIL = 'net_minor=' || coalesce(v_pos->>'net_minor', '0');
  END IF;
  RETURN NEW;
END;
$function$;
CREATE TRIGGER trg_store_orders_cash_order_gate BEFORE INSERT ON public.store_orders
  FOR EACH ROW EXECUTE FUNCTION public.store_orders_enforce_cash_order_gate();

-- ── 레거시 정산 스냅샷 (N-4B 권한 검사용 · 운영 권한 상태 재현) ──
CREATE TABLE public.store_settlements (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id uuid NOT NULL,
  order_id uuid NOT NULL,
  gross_amount bigint NOT NULL DEFAULT 0,
  settlement_status text NOT NULL DEFAULT 'scheduled',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER ON public.store_settlements TO service_role;
GRANT SELECT, REFERENCES, TRIGGER ON public.store_settlements TO anon, authenticated;
INSERT INTO public.store_settlements (store_id, order_id, gross_amount)
VALUES ('00000000-0000-0000-0000-0000000000a1', gen_random_uuid(), 100);

-- ── 기준 데이터 ───────────────────────────────────────────────
-- 레거시 위반 쿠폰 주문 (운영 2026-08-24 pending 2건과 같은 모양: 할인 50, 분할 0/0)
INSERT INTO public.store_orders (id, order_no, buyer_user_id, store_id, total_amount, discount_amount, payment_amount,
                                 order_status, payment_status, coupon_campaign_id, store_funded_amount, platform_funded_amount,
                                 created_at)
VALUES ('00000000-0000-0000-0000-00000000aa01', 'LEGACY-SPLIT-1', '00000000-0000-0000-0000-0000000000e9',
        '00000000-0000-0000-0000-0000000000a1', 300, 50, 250, 'pending', 'paid',
        '00000000-0000-0000-0000-00000000ffff', 0, 0, '2026-08-24 01:43:48+00');

-- 상품 (가격 100 · 재고 추적 없음) + 재고 1 상품
INSERT INTO public.store_products (id, store_id, title, price, product_status, menu_section_id)
VALUES ('00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-0000000000a1', 'p100', 100, 'active',
        '00000000-0000-0000-0000-00000000c001');
INSERT INTO public.store_products (id, store_id, title, price, product_status, track_inventory, stock_qty, menu_section_id)
VALUES ('00000000-0000-0000-0000-00000000e002', '00000000-0000-0000-0000-0000000000a1', 'stock1', 100, 'active', true, 1,
        '00000000-0000-0000-0000-00000000c001');

-- 캠페인: STORE fixed 30 · PLATFORM 10% · SHARED fixed 100 (store 60) · SHARED fixed 50 (store 60 → clamp)
INSERT INTO public.store_coupon_campaigns (id, store_id, discount_type, discount_value, funding_mode, store_funded_amount) VALUES
  ('00000000-0000-0000-0000-0000000c0001', '00000000-0000-0000-0000-0000000000a1', 'fixed_amount', 30, 'STORE_FUNDED', NULL),
  ('00000000-0000-0000-0000-0000000c0002', '00000000-0000-0000-0000-0000000000a1', 'percent', 10, 'PLATFORM_FUNDED', NULL),
  ('00000000-0000-0000-0000-0000000c0003', '00000000-0000-0000-0000-0000000000a1', 'fixed_amount', 100, 'SHARED_FUNDED', 60),
  ('00000000-0000-0000-0000-0000000c0004', '00000000-0000-0000-0000-0000000000a1', 'fixed_amount', 50, 'SHARED_FUNDED', 60);

-- 상품권: 액면 200 · 수수료 10%
INSERT INTO public.gift_certificate_products (id, store_id, face_value, purchase_price, platform_fee_rate)
VALUES ('00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-0000000000a1', 200, 200, 10);
INSERT INTO public.gift_certificate_instances (id, product_id, store_id, purchaser_user_id, current_owner_user_id,
  face_value, purchase_price, remaining_balance, status, version, gift_scope, valid_from, valid_until)
VALUES ('00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-00000000f001',
        '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000e1',
        '00000000-0000-0000-0000-0000000000e1', 200, 200, 200, 'ACTIVE', 1, 'STORE', NULL, NULL);
