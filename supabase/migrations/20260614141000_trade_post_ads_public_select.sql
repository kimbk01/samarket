-- 활성 기간 거래 광고는 누구나 목록 조회 가능(상세 하단 슬롯). 본인 행은 기존 정책 유지.
-- `20260614140000_trade_detail_sections_ads.sql` 이 선행되어 `trade_post_ads` 가 있어야 합니다.

DROP POLICY IF EXISTS "trade_post_ads_select_active_window" ON public.trade_post_ads;
CREATE POLICY "trade_post_ads_select_active_window"
  ON public.trade_post_ads FOR SELECT
  USING (
    apply_status = 'active'
    AND start_at IS NOT NULL
    AND end_at IS NOT NULL
    AND now() >= start_at
    AND now() <= end_at
  );

DO $$
BEGIN
  IF to_regclass('public.v_trade_detail_ad_candidates') IS NOT NULL THEN
    GRANT SELECT ON public.v_trade_detail_ad_candidates TO anon;
    GRANT SELECT ON public.v_trade_detail_ad_candidates TO authenticated;
  END IF;
END $$;
