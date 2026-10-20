-- R7 (delivery_b) — 상품권 매출 `/admin/gift-certificates` (매출 탭) 고정 조회 상한 제거
--
-- 목적: GET /api/admin/gift-certificates/revenue 가 사용 원장을 최근 5000건·잔액 인스턴스 5000건·매장 캐시 5000건까지만
--       읽어 합계(대기/확정 매출·수수료·순액, 미사용 잔액, 매장 캐시)를 메모리로 계산하고, 상세 행은 500건으로 자른 뒤
--       화면이 다시 200건으로 자르던 경로를 DB 한 번의 조회(정확한 합계 + 서버 페이지)로 바꾼다.
--   · 합계: 전체 사용 원장 기준 (취소 제외) — 확정 = 원장 순인식액 > 0
--     (기존 SSOT 함수 public.gift_certificate_redemption_recognized_net 과 같은 entry_type 합)
--   · 미사용 잔액: ACTIVE·PARTIALLY_REDEEMED·GIFT_LOCKED 인스턴스 remaining_balance 합 (음수 0 처리)
--   · 매장 캐시: store_cash_accounts.balance 합 (상품·인스턴스 필터가 없을 때만)
--   · 상세: 결정적 정렬(created_at DESC, id DESC) limit/offset + 정확한 total → 행 표시값은 기존 TS 로더가 id 로 읽는다
-- 규칙 출처: lib/gift-certificate/gift-revenue-recognition.ts (aggregateGiftRevenuePendingRecognized ·
--   netMerchantRecognitionFromLedger) · app/api/admin/gift-certificates/revenue/route.ts
-- 대상 화면: /admin/gift-certificates?tab=revenue
-- 조회 전용 — 원장·금액 쓰기 없음.
--
-- 권한: SECURITY DEFINER · search_path=public · PUBLIC/anon/authenticated EXECUTE 회수 · service_role 만 실행.
--
-- 롤백:
--   DROP FUNCTION IF EXISTS public.admin_gift_revenue_page(uuid, uuid, integer, integer);
--   DROP INDEX IF EXISTS public.gift_certificate_redemptions_created_id_idx;

CREATE INDEX IF NOT EXISTS gift_certificate_redemptions_created_id_idx
  ON public.gift_certificate_redemptions (created_at DESC, id DESC);

CREATE OR REPLACE FUNCTION public.admin_gift_revenue_page(
  p_product_id uuid,
  p_instance_id uuid,
  p_limit integer,
  p_offset integer
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH params AS (
    SELECT LEAST(100, GREATEST(1, coalesce(p_limit, 50))) AS lim,
           GREATEST(0, coalesce(p_offset, 0)) AS off
  ),
  scoped AS (
    SELECT r.id, r.created_at, r.reversed,
           GREATEST(0, r.redeemed_amount) AS gross,
           GREATEST(0, r.platform_fee_amount) AS fee,
           GREATEST(0, r.merchant_net_amount) AS net
      FROM public.gift_certificate_redemptions r
     WHERE (p_instance_id IS NULL OR r.instance_id = p_instance_id)
       AND (p_product_id IS NULL OR p_instance_id IS NOT NULL OR r.instance_id IN (
             SELECT i.id FROM public.gift_certificate_instances i WHERE i.product_id = p_product_id))
  ),
  classified AS (
    SELECT sc.*,
           CASE
             WHEN sc.reversed THEN 'reversed'
             WHEN coalesce((
               SELECT sum(rl.amount)
                 FROM public.gift_certificate_revenue_ledger rl
                WHERE rl.redemption_id = sc.id
                  AND rl.entry_type IN ('REVENUE_AVAILABLE', 'RECOGNITION_CORRECTION', 'REVERSED')
             ), 0) > 0 THEN 'recognized'
             ELSE 'pending'
           END AS state
      FROM scoped sc
  ),
  page AS (
    SELECT c.id, c.created_at
      FROM classified c
     ORDER BY c.created_at DESC, c.id DESC
     LIMIT (SELECT lim FROM params)
    OFFSET (SELECT off FROM params)
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM classified),
    'limit', (SELECT lim FROM params),
    'offset', (SELECT off FROM params),
    'pending_gross', (SELECT coalesce(sum(gross), 0) FROM classified WHERE state = 'pending'),
    'pending_platform_fee', (SELECT coalesce(sum(fee), 0) FROM classified WHERE state = 'pending'),
    'pending_merchant_net', (SELECT coalesce(sum(net), 0) FROM classified WHERE state = 'pending'),
    'recognized_gross', (SELECT coalesce(sum(gross), 0) FROM classified WHERE state = 'recognized'),
    'recognized_platform_fee', (SELECT coalesce(sum(fee), 0) FROM classified WHERE state = 'recognized'),
    'recognized_merchant_net', (SELECT coalesce(sum(net), 0) FROM classified WHERE state = 'recognized'),
    'outstanding_gift_value', (
      SELECT coalesce(sum(GREATEST(0, i.remaining_balance)), 0)
        FROM public.gift_certificate_instances i
       WHERE i.status IN ('ACTIVE', 'PARTIALLY_REDEEMED', 'GIFT_LOCKED')
         AND (p_instance_id IS NULL OR i.id = p_instance_id)
         AND (p_product_id IS NULL OR p_instance_id IS NOT NULL OR i.product_id = p_product_id)
    ),
    'store_cash_total', (
      SELECT CASE WHEN p_product_id IS NULL AND p_instance_id IS NULL
                  THEN coalesce(sum(GREATEST(0, a.balance)), 0) ELSE 0 END
        FROM public.store_cash_accounts a
    ),
    'ids', coalesce((
      SELECT jsonb_agg(pg.id ORDER BY pg.created_at DESC, pg.id DESC) FROM page pg
    ), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.admin_gift_revenue_page(uuid, uuid, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_gift_revenue_page(uuid, uuid, integer, integer) TO service_role;
