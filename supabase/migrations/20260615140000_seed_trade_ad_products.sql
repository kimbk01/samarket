-- 거래 마켓 광고 정책 시드 (초기값 — 이후 어드민·SQL로만 변경)
DO $$
BEGIN
  IF to_regclass('public.ad_products') IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.ad_products (
    name, description, board_key, ad_type, duration_days, point_cost, priority_default, is_active,
    placement, service_type, allow_duplicate, auto_approve
  )
  SELECT '거래 상세 하단 광고 3일', '상품 상세 하단 추천 영역(광고 슬롯) 3일 노출', 'trade', 'highlight', 3, 3000, 120, true,
    'detail_bottom', NULL, false, false
  WHERE NOT EXISTS (
    SELECT 1 FROM public.ad_products p WHERE p.board_key = 'trade' AND p.placement = 'detail_bottom' AND p.duration_days = 3
  );

  INSERT INTO public.ad_products (
    name, description, board_key, ad_type, duration_days, point_cost, priority_default, is_active,
    placement, service_type, allow_duplicate, auto_approve
  )
  SELECT '거래 상세 하단 광고 7일', '상품 상세 하단 추천 영역(광고 슬롯) 7일 노출', 'trade', 'highlight', 7, 6000, 130, true,
    'detail_bottom', NULL, false, false
  WHERE NOT EXISTS (
    SELECT 1 FROM public.ad_products p WHERE p.board_key = 'trade' AND p.placement = 'detail_bottom' AND p.duration_days = 7
  );

  INSERT INTO public.ad_products (
    name, description, board_key, ad_type, duration_days, point_cost, priority_default, is_active,
    placement, service_type, allow_duplicate, auto_approve
  )
  SELECT '거래 리스트 상단 광고 3일', '목록 상단 + 상세 하단 복합(상위 광고)', 'trade', 'top_fixed', 3, 8000, 200, true,
    'list_top', NULL, false, false
  WHERE NOT EXISTS (
    SELECT 1 FROM public.ad_products p WHERE p.board_key = 'trade' AND p.placement = 'list_top' AND p.duration_days = 3
  );

  INSERT INTO public.ad_products (
    name, description, board_key, ad_type, duration_days, point_cost, priority_default, is_active,
    placement, service_type, allow_duplicate, auto_approve
  )
  SELECT '거래 프리미엄 광고 7일', '홈·카테고리·상세 복합 슬롯(운영 승인)', 'trade', 'highlight', 7, 15000, 300, true,
    'premium_all', NULL, false, false
  WHERE NOT EXISTS (
    SELECT 1 FROM public.ad_products p WHERE p.board_key = 'trade' AND p.placement = 'premium_all' AND p.duration_days = 7
  );
END $$;
