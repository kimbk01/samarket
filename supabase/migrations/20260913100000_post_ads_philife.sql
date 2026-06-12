-- Philife / 커뮤니티 게시글 광고 (post_ads) — docs/ads-schema.sql 공식 마이그레이션
BEGIN;

CREATE TABLE IF NOT EXISTS public.ad_products (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text NOT NULL,
  description      text NOT NULL DEFAULT '',
  board_key        text,
  ad_type          text NOT NULL CHECK (ad_type IN ('top_fixed','mid_insert','highlight')),
  duration_days    int NOT NULL DEFAULT 3,
  point_cost       int NOT NULL DEFAULT 0,
  priority_default int NOT NULL DEFAULT 100,
  is_active        boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF to_regclass('public.community_posts') IS NULL THEN
    RAISE NOTICE 'post_ads: community_posts 없음 — post_ads 테이블 스킵';
    RETURN;
  END IF;

  CREATE TABLE IF NOT EXISTS public.post_ads (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id          uuid NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
    user_id          uuid NOT NULL REFERENCES auth.users(id),
    ad_product_id    uuid NOT NULL REFERENCES public.ad_products(id),
    board_key        text NOT NULL DEFAULT 'plife',
    ad_type          text NOT NULL CHECK (ad_type IN ('top_fixed','mid_insert','highlight')),
    apply_status     text NOT NULL DEFAULT 'pending_review'
      CHECK (apply_status IN (
        'draft','pending_payment','pending_review',
        'approved','active','rejected','expired','cancelled'
      )),
    payment_method   text NOT NULL DEFAULT 'points'
      CHECK (payment_method IN ('points','bank_transfer','manual')),
    point_cost       int NOT NULL DEFAULT 0,
    paid_amount      numeric(12,2) NOT NULL DEFAULT 0,
    start_at         timestamptz,
    end_at           timestamptz,
    priority         int NOT NULL DEFAULT 100,
    is_active        boolean NOT NULL DEFAULT false,
    admin_note       text,
    approved_by      uuid REFERENCES auth.users(id),
    approved_at      timestamptz,
    rejected_by      uuid REFERENCES auth.users(id),
    rejected_at      timestamptz,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now()
  );

  CREATE UNIQUE INDEX IF NOT EXISTS uq_post_ads_post_active
    ON public.post_ads (post_id)
    WHERE apply_status IN ('pending_review','approved','active');

  CREATE INDEX IF NOT EXISTS idx_post_ads_user_created ON public.post_ads (user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_post_ads_status ON public.post_ads (apply_status);

  CREATE TABLE IF NOT EXISTS public.ad_payment_requests (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    post_ad_id       uuid NOT NULL REFERENCES public.post_ads(id) ON DELETE CASCADE,
    user_id          uuid NOT NULL REFERENCES auth.users(id),
    payment_method   text NOT NULL CHECK (payment_method IN ('bank_transfer','manual')),
    depositor_name   text NOT NULL DEFAULT '',
    requested_amount numeric(12,2) NOT NULL DEFAULT 0,
    memo             text,
    payment_status   text NOT NULL DEFAULT 'pending'
      CHECK (payment_status IN ('pending','checking','confirmed','rejected','cancelled')),
    confirmed_by     uuid REFERENCES auth.users(id),
    confirmed_at     timestamptz,
    admin_note       text,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS public.ad_logs (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    post_ad_id  uuid NOT NULL REFERENCES public.post_ads(id) ON DELETE CASCADE,
    actor_id    uuid REFERENCES auth.users(id),
    log_type    text NOT NULL,
    payload     jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at  timestamptz NOT NULL DEFAULT now()
  );

  CREATE INDEX IF NOT EXISTS idx_ad_logs_post_ad ON public.ad_logs (post_ad_id, created_at DESC);

  ALTER TABLE public.ad_products ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS ad_products_select_active ON public.ad_products;
  CREATE POLICY ad_products_select_active ON public.ad_products FOR SELECT USING (is_active = true);

  ALTER TABLE public.post_ads ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS post_ads_select_own ON public.post_ads;
  CREATE POLICY post_ads_select_own ON public.post_ads FOR SELECT USING (user_id = auth.uid());
  DROP POLICY IF EXISTS post_ads_insert_own ON public.post_ads;
  CREATE POLICY post_ads_insert_own ON public.post_ads FOR INSERT WITH CHECK (user_id = auth.uid());

  ALTER TABLE public.ad_payment_requests ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS ad_payment_requests_select_owner ON public.ad_payment_requests;
  CREATE POLICY ad_payment_requests_select_owner ON public.ad_payment_requests FOR SELECT USING (user_id = auth.uid());
  DROP POLICY IF EXISTS ad_payment_requests_insert_owner ON public.ad_payment_requests;
  CREATE POLICY ad_payment_requests_insert_owner ON public.ad_payment_requests FOR INSERT WITH CHECK (user_id = auth.uid());

  ALTER TABLE public.ad_logs ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS ad_logs_select_owner ON public.ad_logs;
  CREATE POLICY ad_logs_select_owner ON public.ad_logs FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.post_ads pa WHERE pa.id = ad_logs.post_ad_id AND pa.user_id = auth.uid())
  );
END $$;

INSERT INTO public.ad_products (id, name, description, board_key, ad_type, duration_days, point_cost, priority_default)
VALUES
  ('a0000001-0000-4000-8000-000000000001', '플라이프 상단고정 3일', '필라이프 피드 상단에 3일간 고정 노출됩니다.', 'plife', 'top_fixed', 3, 10000, 100),
  ('a0000002-0000-4000-8000-000000000002', '플라이프 상단고정 7일', '필라이프 피드 상단에 7일간 고정 노출됩니다.', 'plife', 'top_fixed', 7, 20000, 100),
  ('a0000003-0000-4000-8000-000000000003', '플라이프 중간삽입 5일', '필라이프 피드 중간에 5일간 삽입 노출됩니다.', 'plife', 'mid_insert', 5, 12000, 200)
ON CONFLICT (id) DO NOTHING;

COMMIT;
