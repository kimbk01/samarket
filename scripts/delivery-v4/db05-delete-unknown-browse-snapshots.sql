-- v4 W5 · DB-05 데이터 정리 (1회 실행) — 존재하지 않는 업종 slug 로 저장된 browse 스냅샷 삭제.
-- 대상: public.stores_browse_snapshots 중 primary_slug 가 public.store_categories.slug 에 없는 행.
--   스냅샷은 응답 캐시(재생성 가능)라 삭제해도 원천 데이터 영향 없음. 신규 적재 차단은 W2 코드(DB-05 코드) 담당.
-- 운영 READ ONLY 확인값(2026-10-29 PHT): 6행 — primary_slug all · dining · food · pet-shop · restaurant_western · 식당
--   (모두 sub_slug=all · ui_lang=ko · list_scope=bundle · payload taxonomy.categoryId 빈 값 = unknown 결과).
-- 실행: psql ... -v ON_ERROR_STOP=1 -f scripts/delivery-v4/db05-delete-unknown-browse-snapshots.sql
-- 롤백: 불필요(캐시 — 다음 요청 시 재생성). 원하면 실행 전 SELECT 결과로 재삽입.

\set ON_ERROR_STOP on
BEGIN;

SELECT primary_slug, sub_slug, region, city, district, ui_lang, list_scope, updated_at
  FROM public.stores_browse_snapshots s
 WHERE NOT EXISTS (SELECT 1 FROM public.store_categories c WHERE c.slug = s.primary_slug)
 ORDER BY primary_slug;

DELETE FROM public.stores_browse_snapshots s
 WHERE NOT EXISTS (SELECT 1 FROM public.store_categories c WHERE c.slug = s.primary_slug)
RETURNING s.primary_slug, s.sub_slug, s.list_scope;

COMMIT;
