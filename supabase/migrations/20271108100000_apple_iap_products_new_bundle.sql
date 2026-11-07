-- 새 Apple 개발자 계정 전환 — IAP 상품 ID 교체 (Owner 2026-11-07 「계획 승인」 ·
-- docs/audit/ios-new-developer-account-transition-plan-2026-11-07.md 3절)
--
-- ⚠ 운영 적용 시점: 새 계정 App Store Connect 에 아래 새 상품 ID 3종을 만든 뒤, 서버 환경변수
--   (APPLE_IAP_BUNDLE_ID = com.dibay.ph) 교체와 같은 날. 그 전에 적용하면 기존 시험 앱(com.dibay.app)의
--   충전 화면에서 상품이 사라진다. 운영 적용은 별도 Owner 승인.
--
-- 변경: product_id 만 교체 (point_plan_id·kind·is_active·sort_order 그대로 → 지급량 1,000 / 5,250 / 11,000P 불변)
--   com.dibay.app.point.1000  → com.dibay.ph.point.1000
--   com.dibay.app.point.5000  → com.dibay.ph.point.5000
--   com.dibay.app.point.10000 → com.dibay.ph.point.10000
-- 안전장치: 옛 상품 ID 로 기록된 Apple 거래가 1건이라도 있으면 중단 (거래 기록과 상품 표가 어긋나지 않게).
-- 롤백: 아래 UPDATE 를 반대 방향으로 실행 (같은 조건).

begin;

do $$
begin
  if exists (
    select 1 from public.apple_iap_transactions
     where product_id in ('com.dibay.app.point.1000', 'com.dibay.app.point.5000', 'com.dibay.app.point.10000')
  ) then
    raise exception 'apple_iap_transactions already reference old product ids — stop and review';
  end if;
end $$;

update public.apple_iap_products
   set product_id = 'com.dibay.ph.point.' || substring(product_id from 'com\.dibay\.app\.point\.(\d+)$'),
       updated_at = now()
 where product_id in ('com.dibay.app.point.1000', 'com.dibay.app.point.5000', 'com.dibay.app.point.10000');

do $$
begin
  if (select count(*) from public.apple_iap_products where product_id like 'com.dibay.ph.point.%') <> 3 then
    raise exception 'expected 3 new product ids after update';
  end if;
end $$;

commit;
