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
CREATE POLICY "ad_products_select_active"
  ON ad_products FOR SELECT
  USING (is_active = true);

ALTER TABLE post_ads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "post_ads_select_owner_or_admin"
  ON post_ads FOR SELECT
  USING (user_id = auth.uid());
CREATE POLICY "post_ads_insert_auth"
  ON post_ads FOR INSERT
  WITH CHECK (user_id = auth.uid());

ALTER TABLE ad_payment_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ad_payment_requests_select_owner"
  ON ad_payment_requests FOR SELECT
  USING (user_id = auth.uid());
CREATE POLICY "ad_payment_requests_insert_owner"
  ON ad_payment_requests FOR INSERT
  WITH CHECK (user_id = auth.uid());

ALTER TABLE ad_logs ENABLE ROW LEVEL SECURITY;
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
-- =============================================================================

-- 광고 상품 3종
INSERT INTO ad_products (id, name, description, board_key, ad_type, duration_days, point_cost, priority_default) VALUES
  ('adp-00000000-0001', '플라이프 상단고정 3일', '필라이프 피드 상단에 3일간 고정 노출됩니다.', 'plife', 'top_fixed', 3, 10000, 100),
  ('adp-00000000-0002', '플라이프 상단고정 7일', '필라이프 피드 상단에 7일간 고정 노출됩니다.', 'plife', 'top_fixed', 7, 20000, 100),
  ('adp-00000000-0003', '플라이프 중간삽입 5일', '필라이프 피드 중간에 5일간 삽입 노출됩니다.',  'plife', 'mid_insert', 5, 12000, 200)
ON CONFLICT (id) DO NOTHING;

-- 샘플 광고 게시글 (community_posts가 있다고 가정)
-- INSERT INTO community_posts (id, title, content, ...) VALUES (...);

-- 샘플 active 광고 신청
INSERT INTO post_ads (
  id, post_id, user_id, ad_product_id, board_key, ad_type,
  apply_status, payment_method, point_cost, paid_amount,
  start_at, end_at, priority, is_active,
  approved_by, approved_at
) VALUES (
  'pa-00000000-0001',
  'ad-post-00000000-0001',  -- community_posts.id
  '00000000-0000-4000-8000-000000000001',  -- 샘플 광고주 user_id
  'adp-00000000-0001',
  'plife', 'top_fixed',
  'active', 'points', 10000, 10000,
  now() - interval '1 hour',
  now() + interval '3 days',
  100, true,
  '00000000-0000-4000-8000-000000000099',  -- admin user_id
  now() - interval '30 minutes'
) ON CONFLICT (id) DO NOTHING;

-- point_ledger: 광고 구매 차감 기록
INSERT INTO point_ledger (
  user_id, entry_type, amount, balance_after,
  related_type, related_id, description, actor_type
) VALUES (
  '00000000-0000-4000-8000-000000000001',
  'spend', -10000, 5000,
  'ad_purchase', 'pa-00000000-0001',
  '플라이프 상단고정 3일 광고 구매',
  'user'
) ON CONFLICT DO NOTHING;

-- ad_logs: 승인 로그
INSERT INTO ad_logs (post_ad_id, actor_id, log_type, payload) VALUES
  ('pa-00000000-0001', '00000000-0000-4000-8000-000000000099', 'approved', '{"note":"샘플 광고 승인"}');

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
