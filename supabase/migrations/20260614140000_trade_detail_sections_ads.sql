-- 거래 상세 하단 광고 슬롯 + 포인트 hold + ad_products 확장(있을 때만)
-- ad_products / Philife 스키마가 없는 환경에서도 trade_post_ads 테이블만 생성되도록 방어

-- ad_products 확장
DO $$
BEGIN
  IF to_regclass('public.ad_products') IS NOT NULL THEN
    ALTER TABLE public.ad_products ADD COLUMN IF NOT EXISTS placement text;
    ALTER TABLE public.ad_products ADD COLUMN IF NOT EXISTS service_type text;
    ALTER TABLE public.ad_products ADD COLUMN IF NOT EXISTS category_id uuid;
    ALTER TABLE public.ad_products ADD COLUMN IF NOT EXISTS region_target text;
    ALTER TABLE public.ad_products ADD COLUMN IF NOT EXISTS allow_duplicate boolean NOT NULL DEFAULT false;
    ALTER TABLE public.ad_products ADD COLUMN IF NOT EXISTS auto_approve boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- 거래 게시글 광고 (ad_product_id 는 선택 — 정책 행이 없을 수 있음)
CREATE TABLE IF NOT EXISTS public.trade_post_ads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ad_product_id uuid,
  apply_status text NOT NULL DEFAULT 'pending'
    CHECK (apply_status IN (
      'pending','approved','active','rejected','ended','cancelled','refunded'
    )),
  point_cost integer NOT NULL DEFAULT 0,
  priority integer NOT NULL DEFAULT 100,
  start_at timestamptz,
  end_at timestamptz,
  admin_memo text,
  approved_by uuid REFERENCES auth.users(id),
  approved_at timestamptz,
  rejected_by uuid REFERENCES auth.users(id),
  rejected_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF to_regclass('public.ad_products') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'trade_post_ads_ad_product_id_fkey'
    ) THEN
      ALTER TABLE public.trade_post_ads
        ADD CONSTRAINT trade_post_ads_ad_product_id_fkey
        FOREIGN KEY (ad_product_id) REFERENCES public.ad_products(id) ON DELETE SET NULL;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_trade_post_ads_post_id ON public.trade_post_ads (post_id);
CREATE INDEX IF NOT EXISTS idx_trade_post_ads_status ON public.trade_post_ads (apply_status);
CREATE INDEX IF NOT EXISTS idx_trade_post_ads_user ON public.trade_post_ads (user_id);

CREATE TABLE IF NOT EXISTS public.trade_ad_point_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trade_post_ad_id uuid NOT NULL REFERENCES public.trade_post_ads(id) ON DELETE CASCADE,
  amount integer NOT NULL CHECK (amount >= 0),
  status text NOT NULL DEFAULT 'held'
    CHECK (status IN ('held','released','charged')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trade_ad_point_holds_user ON public.trade_ad_point_holds (user_id);

CREATE OR REPLACE VIEW public.v_trade_detail_ad_candidates AS
SELECT
  tpa.id AS trade_ad_id,
  tpa.post_id,
  tpa.priority,
  tpa.ad_product_id,
  tpa.user_id AS advertiser_user_id,
  tpa.start_at,
  tpa.end_at
FROM public.trade_post_ads tpa
WHERE tpa.apply_status = 'active'
  AND tpa.start_at IS NOT NULL
  AND tpa.end_at IS NOT NULL
  AND now() >= tpa.start_at
  AND now() <= tpa.end_at;

COMMENT ON VIEW public.v_trade_detail_ad_candidates IS '거래 상세 하단 광고 시간·상태 통과 후보 — placement 는 앱에서 ad_products 조인';

ALTER TABLE public.trade_post_ads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trade_ad_point_holds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "trade_post_ads_select_own" ON public.trade_post_ads;
CREATE POLICY "trade_post_ads_select_own"
  ON public.trade_post_ads FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "trade_post_ads_insert_own" ON public.trade_post_ads;
CREATE POLICY "trade_post_ads_insert_own"
  ON public.trade_post_ads FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "trade_ad_point_holds_select_own" ON public.trade_ad_point_holds;
CREATE POLICY "trade_ad_point_holds_select_own"
  ON public.trade_ad_point_holds FOR SELECT
  USING (user_id = auth.uid());

GRANT SELECT ON public.v_trade_detail_ad_candidates TO service_role;
GRANT SELECT ON public.v_trade_detail_ad_candidates TO postgres;
