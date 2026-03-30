-- 통합 사용자 주소 원장 (생활·거래·배달 공통)
-- API는 service_role 로 주로 접근하며, 직접 클라이언트 접속 시 RLS 로 본인 행만.

CREATE TABLE IF NOT EXISTS public.user_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label_type text NOT NULL DEFAULT 'other'
    CHECK (label_type IN ('home', 'office', 'shop', 'other')),
  nickname text,
  recipient_name text,
  phone_number text,
  country_code text NOT NULL DEFAULT 'PH',
  country_name text NOT NULL DEFAULT 'Philippines',
  province text,
  city_municipality text,
  barangay text,
  district text,
  street_address text,
  building_name text,
  unit_floor_room text,
  landmark text,
  postal_code text,
  latitude double precision,
  longitude double precision,
  full_address text,
  neighborhood_name text,
  app_region_id text,
  app_city_id text,
  use_for_life boolean NOT NULL DEFAULT true,
  use_for_trade boolean NOT NULL DEFAULT true,
  use_for_delivery boolean NOT NULL DEFAULT true,
  is_default_master boolean NOT NULL DEFAULT false,
  is_default_life boolean NOT NULL DEFAULT false,
  is_default_trade boolean NOT NULL DEFAULT false,
  is_default_delivery boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_addresses_user_id_idx ON public.user_addresses (user_id);
CREATE INDEX IF NOT EXISTS user_addresses_user_active_sort_idx
  ON public.user_addresses (user_id, is_active, sort_order DESC, updated_at DESC);

-- 활성 행 기준 유저당 기본 플래그 1개만
CREATE UNIQUE INDEX IF NOT EXISTS user_addresses_one_master
  ON public.user_addresses (user_id)
  WHERE is_active AND is_default_master;
CREATE UNIQUE INDEX IF NOT EXISTS user_addresses_one_life
  ON public.user_addresses (user_id)
  WHERE is_active AND is_default_life;
CREATE UNIQUE INDEX IF NOT EXISTS user_addresses_one_trade
  ON public.user_addresses (user_id)
  WHERE is_active AND is_default_trade;
CREATE UNIQUE INDEX IF NOT EXISTS user_addresses_one_delivery
  ON public.user_addresses (user_id)
  WHERE is_active AND is_default_delivery;

CREATE OR REPLACE FUNCTION public.touch_user_addresses_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_addresses_updated_at ON public.user_addresses;
CREATE TRIGGER user_addresses_updated_at
  BEFORE UPDATE ON public.user_addresses
  FOR EACH ROW EXECUTE FUNCTION public.touch_user_addresses_updated_at();

ALTER TABLE public.user_addresses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_addresses_select_own ON public.user_addresses;
CREATE POLICY user_addresses_select_own ON public.user_addresses
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS user_addresses_insert_own ON public.user_addresses;
CREATE POLICY user_addresses_insert_own ON public.user_addresses
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS user_addresses_update_own ON public.user_addresses;
CREATE POLICY user_addresses_update_own ON public.user_addresses
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS user_addresses_delete_own ON public.user_addresses;
CREATE POLICY user_addresses_delete_own ON public.user_addresses
  FOR DELETE USING (auth.uid() = user_id);

COMMENT ON TABLE public.user_addresses IS
  '사마켓 통합 주소 원장 — 생활/거래/배달 기본값 분리, 주문 배송지는 store_orders 컬럼에 스냅샷';
