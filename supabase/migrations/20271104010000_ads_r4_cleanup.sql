-- 재감사 R4 정리 (Owner 「R4 진행」 2026-11-03) — docs/audit/ads-reaudit-final-2026-11-03.md §3-4
-- 백업: docs/audit/r4-db-backup-2026-11-03.json (적용 직전 운영 값)
--
-- 1) ad_products 이름 오타 「플라이프」 → 「필라이프」 (비활성 3행 · 설명은 이미 「필라이프」).
-- 2) platform_ad_products · store_ad_applications: 앱·서버·DB 함수 참조 0, 신청 0건(재감사 R4 조회). 지우지 않고
--    상품 2행을 끄고 표에 「미사용」 표시만 남긴다(외래키 store_ad_applications → platform_ad_products 유지).
--    정정: 재감사 보고의 「platform_ad_products 사용 0」은 코드 참조 기준이었다 — 표에는 활성 상품 2행이 있었다.
-- Storage 고아 파일 10개(팝업 테스트 초안 8 · 인트로 초안 2)는 Storage API 로 지웠다(SQL 아님).
--    파일 백업: 작업 Mac 로컬 docs/audit/r4-storage-backup-2026-11-03/ (manifest.json = 버킷·경로·바이트·sha256).
--    운영 Storage 파일이라 git 에는 올리지 않았다.

UPDATE public.ad_products
   SET name = replace(name, '플라이프', '필라이프'),
       updated_at = now()
 WHERE id IN (
   'a0000001-0000-4000-8000-000000000001',
   'a0000002-0000-4000-8000-000000000002',
   'a0000003-0000-4000-8000-000000000003'
 )
   AND name LIKE '플라이프%';

UPDATE public.platform_ad_products
   SET is_active = false,
       updated_at = now()
 WHERE id IN (
   'b1000001-0001-4001-8001-000000000001',
   'b1000002-0002-4002-8002-000000000002'
 )
   AND is_active = true;

COMMENT ON TABLE public.platform_ad_products IS
  '미사용(재감사 R4 2026-11-03): 앱·서버·DB 함수 참조 0. 배달 광고 상품 원본은 delivery_ad_packages. 새로 쓰지 말 것.';
COMMENT ON TABLE public.store_ad_applications IS
  '미사용(재감사 R4 2026-11-03): 앱·서버·DB 함수 참조 0, 신청 0건. 매장 광고 신청은 배달 광고 신청 흐름을 쓴다. 새로 쓰지 말 것.';
