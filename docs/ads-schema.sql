-- =============================================================================
-- SAMarket 유료 광고 시스템 스키마
-- 광고주 신청 → 포인트 차감 or 입금 → 관리자 승인 → 피드 노출 → 만료
-- =============================================================================

-- -----------------------------------------------------------------------------
-- A. ad_products  광고 상품 정의
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ad_products (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text NOT NULL,
  description      text NOT NULL DEFAULT '',
  -- 적용 게시판: 'plife' | 'trade' | 'community' | NULL(전체)
  board_key        text,
  -- 광고 유형: top_fixed | mid_insert | highlight
  ad_type          text NOT NULL
                     CHECK (ad_type IN ('top_fixed','mid_insert','highlight')),
  duration_days    int NOT NULL DEFAULT 3,
  point_cost       int NOT NULL DEFAULT 0,
  priority_default int NOT NULL DEFAULT 100,
  is_active        boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- B. post_ads  광고 신청 및 운영 정보
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS post_ads (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id          uuid NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  user_id          uuid NOT NULL REFERENCES auth.users(id),
  ad_product_id    uuid NOT NULL REFERENCES ad_products(id),
  board_key        text NOT NULL DEFAULT 'plife',
  ad_type          text NOT NULL
                     CHECK (ad_type IN ('top_fixed','mid_insert','highlight')),
  -- 신청 상태
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

-- 게시글 1개당 동시에 active 광고 1개만 허용하는 제약
CREATE UNIQUE INDEX IF NOT EXISTS uq_post_ads_post_active
  ON post_ads (post_id)
  WHERE apply_status IN ('pending_review','approved','active');

-- -----------------------------------------------------------------------------
-- C. ad_payment_requests  입금/결제 요청
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ad_payment_requests (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_ad_id       uuid NOT NULL REFERENCES post_ads(id) ON DELETE CASCADE,
  user_id          uuid NOT NULL REFERENCES auth.users(id),
  payment_method   text NOT NULL
                     CHECK (payment_method IN ('bank_transfer','manual')),
  depositor_name   text NOT NULL DEFAULT '',
  requested_amount numeric(12,2) NOT NULL DEFAULT 0,
  memo             text,
  payment_status   text NOT NULL DEFAULT 'pending'
                     CHECK (payment_status IN (
                       'pending','checking','confirmed','rejected','cancelled'
                     )),
  confirmed_by     uuid REFERENCES auth.users(id),
  confirmed_at     timestamptz,
  admin_note       text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- D. ad_logs  광고 운영 로그
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ad_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_ad_id  uuid NOT NULL REFERENCES post_ads(id) ON DELETE CASCADE,
  actor_id    uuid REFERENCES auth.users(id),
  -- 로그 유형: applied | approved | rejected | cancelled | expired | payment_confirmed | note_updated
  log_type    text NOT NULL,
  payload     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- E. point_ledger  포인트 원장 (광고 관련 entry_type 추가)
-- -----------------------------------------------------------------------------
-- 기존 테이블에 아래 entry_type 값을 지원하면 됨:
--   'ad_purchase'  광고 구매 차감
--   'ad_refund'    광고 반려 환불
-- 추가 DDL 없이 기존 point_ledger 재사용

-- =============================================================================
-- RLS 정책 초안
-- =============================================================================

ALTER TABLE ad_products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ad_products_select_active" ON ad_products;
CREATE POLICY "ad_products_select_active"
  ON ad_products FOR SELECT
  USING (is_active = true);

ALTER TABLE post_ads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "post_ads_select_owner_or_admin" ON post_ads;
CREATE POLICY "post_ads_select_owner_or_admin"
  ON post_ads FOR SELECT
  USING (user_id = auth.uid());
DROP POLICY IF EXISTS "post_ads_insert_auth" ON post_ads;
CREATE POLICY "post_ads_insert_auth"
  ON post_ads FOR INSERT
  WITH CHECK (user_id = auth.uid());

ALTER TABLE ad_payment_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ad_payment_requests_select_owner" ON ad_payment_requests;
CREATE POLICY "ad_payment_requests_select_owner"
  ON ad_payment_requests FOR SELECT
  USING (user_id = auth.uid());
DROP POLICY IF EXISTS "ad_payment_requests_insert_owner" ON ad_payment_requests;
CREATE POLICY "ad_payment_requests_insert_owner"
  ON ad_payment_requests FOR INSERT
  WITH CHECK (user_id = auth.uid());

ALTER TABLE ad_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ad_logs_select_owner" ON ad_logs;
CREATE POLICY "ad_logs_select_owner"
  ON ad_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM post_ads pa
      WHERE pa.id = ad_logs.post_ad_id AND pa.user_id = auth.uid()
    )
  );

-- =============================================================================
-- 샘플 데이터 INSERT
-- (개발·스테이징에서만 실행)
-- id 는 반드시 RFC UUID(hex) 형식이어야 합니다. `adp-00000000-0001` 같은 문자열은 22P02 오류.
-- =============================================================================

-- 광고 상품 3종 (고정 UUID — supabase/migrations/20260913100000_post_ads_philife.sql 시드와 맞춤)
INSERT INTO ad_products (id, name, description, board_key, ad_type, duration_days, point_cost, priority_default) VALUES
  ('a0000001-0000-4000-8000-000000000001', '플라이프 상단고정 3일', '필라이프 피드 상단에 3일간 고정 노출됩니다.', 'plife', 'top_fixed', 3, 10000, 100),
  ('a0000002-0000-4000-8000-000000000002', '플라이프 상단고정 7일', '필라이프 피드 상단에 7일간 고정 노출됩니다.', 'plife', 'top_fixed', 7, 20000, 100),
  ('a0000003-0000-4000-8000-000000000003', '플라이프 중간삽입 5일', '필라이프 피드 중간에 5일간 삽입 노출됩니다.',  'plife', 'mid_insert', 5, 12000, 200)
ON CONFLICT (id) DO NOTHING;

-- 아래 샘플 신청·원장·로그는 community_posts / auth.users FK 가 있을 때만 삽입
DO $$
DECLARE
  v_post_id uuid := 'c0000001-0000-4000-8000-000000000001';
  v_user_id uuid := '00000000-0000-4000-8000-000000000001';
  v_admin_id uuid := '00000000-0000-4000-8000-000000000099';
  v_post_ad_id uuid := 'b0000001-0000-4000-8000-000000000001';
  v_product_id uuid := 'a0000001-0000-4000-8000-000000000001';
BEGIN
  IF to_regclass('public.community_posts') IS NULL
     OR to_regclass('public.post_ads') IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM community_posts WHERE id = v_post_id) THEN
    RAISE NOTICE 'skip post_ads sample: community_posts % not found', v_post_id;
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_user_id) THEN
    RAISE NOTICE 'skip post_ads sample: auth.users % not found', v_user_id;
    RETURN;
  END IF;

  INSERT INTO post_ads (
    id, post_id, user_id, ad_product_id, board_key, ad_type,
    apply_status, payment_method, point_cost, paid_amount,
    start_at, end_at, priority, is_active,
    approved_by, approved_at
  ) VALUES (
    v_post_ad_id,
    v_post_id,
    v_user_id,
    v_product_id,
    'plife', 'top_fixed',
    'active', 'points', 10000, 10000,
    now() - interval '1 hour',
    now() + interval '3 days',
    100, true,
    CASE WHEN EXISTS (SELECT 1 FROM auth.users WHERE id = v_admin_id) THEN v_admin_id ELSE NULL END,
    now() - interval '30 minutes'
  )
  ON CONFLICT (id) DO NOTHING;

  IF to_regclass('public.point_ledger') IS NOT NULL THEN
    INSERT INTO point_ledger (
      user_id, entry_type, amount, balance_after,
      related_type, related_id, description, actor_type
    )
    SELECT
      v_user_id,
      'spend', -10000, 5000,
      'ad_purchase', v_post_ad_id::text,
      '플라이프 상단고정 3일 광고 구매',
      'user'
    WHERE NOT EXISTS (
      SELECT 1 FROM point_ledger pl
      WHERE pl.related_type = 'ad_purchase' AND pl.related_id = v_post_ad_id::text
    );
  END IF;

  IF to_regclass('public.ad_logs') IS NOT NULL THEN
    INSERT INTO ad_logs (post_ad_id, actor_id, log_type, payload)
    SELECT v_post_ad_id, v_admin_id, 'approved', '{"note":"샘플 광고 승인"}'::jsonb
    WHERE EXISTS (SELECT 1 FROM auth.users WHERE id = v_admin_id)
      AND NOT EXISTS (
        SELECT 1 FROM ad_logs al
        WHERE al.post_ad_id = v_post_ad_id AND al.log_type = 'approved'
      );
  END IF;
END $$;

-- =============================================================================
-- 광고 만료 자동 처리 트리거 (선택)
-- =============================================================================
CREATE OR REPLACE FUNCTION expire_post_ads() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE post_ads
    SET apply_status = 'expired', is_active = false, updated_at = now()
  WHERE apply_status = 'active'
    AND end_at < now();
END;
$$;
-- pg_cron 또는 Supabase Functions에서 주기적으로 호출:
-- SELECT cron.schedule('expire-ads', '*/10 * * * *', 'SELECT expire_post_ads()');

-- =============================================================================
-- 게시판 리스트용 active 광고 조회 예시
-- =============================================================================
-- SELECT
--   pa.id AS ad_id, pa.post_id, pa.priority,
--   pa.start_at, pa.end_at, pa.board_key, pa.ad_type,
--   cp.title, cp.content, cp.images
-- FROM post_ads pa
-- JOIN community_posts cp ON cp.id = pa.post_id
-- WHERE pa.board_key = 'plife'
--   AND pa.ad_type = 'top_fixed'
--   AND pa.is_active = true
--   AND now() BETWEEN pa.start_at AND pa.end_at
-- ORDER BY pa.priority ASC;
