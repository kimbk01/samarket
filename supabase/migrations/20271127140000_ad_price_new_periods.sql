-- 광고 금액 권장안 — 새 기간 상품 4개 (Owner 「적용 승인」 2026-11-27)
-- 설계: docs/audit/ad-price-recommendation-apply-design-2026-11-27.md §2-2 · 금액 근거 docs/audit/ad-pricing-notice-design-2026-11-26.md §6
-- 어드민에 상품 추가 화면이 없어 마이그레이션으로 넣는다. 상위노출 2개는 코드 상품 목록(seed)에 id 가 먼저 있어야 화면·결제에 나온다(PR 코드 먼저 반영).
-- 기존 6개 금액 변경은 어드민 화면(사유·이력·동시 저장 보호)으로 한다 — 이 파일에 넣지 않는다.
-- 되돌리기: 4행 is_active = false (지우지 않음 — 결제 기록이 id 를 가리킬 수 있음)

INSERT INTO public.member_promotion_products (id, domain, placement, duration_days, point_cost, is_active, sort_order, revision)
VALUES ('trade_promote_3', 'trade', 'feed_boost', 3, 250, true, 5, 1),
       ('community_promote_14', 'community', 'community_top_pin', 14, 900, true, 45, 1)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.member_promotion_product_changes (product_id, admin_id, before, after, reason)
SELECT p.id, NULL, '{}'::jsonb, to_jsonb(p), 'Owner 금액 권장안 적용 2026-11-27 — 새 기간 상품'
  FROM public.member_promotion_products p
 WHERE p.id IN ('trade_promote_3', 'community_promote_14')
   AND NOT EXISTS (SELECT 1 FROM public.member_promotion_product_changes c
                    WHERE c.product_id = p.id AND c.reason = 'Owner 금액 권장안 적용 2026-11-27 — 새 기간 상품');

INSERT INTO public.feed_ad_products (id, domain, duration_days, point_cost, title_ko, title_en, is_active, sort_order)
VALUES ('feed_banner_trade_14', 'trade', 14, 2700, '거래 피드 광고 14일', 'Trade feed ad 14 days', true, 25),
       ('feed_banner_community_14', 'community', 14, 2700, '커뮤니티 피드 광고 14일', 'Community feed ad 14 days', true, 45)
ON CONFLICT (id) DO NOTHING;
