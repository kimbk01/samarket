-- 옵션 단순화: 상품별 정본은 store_products.options_json 만 사용합니다.
-- 상품–템플릿 연결 테이블이 있으면 제거합니다.
--
-- store_option_groups 가 아직 없다면 COMMENT 는 건너뜁니다.
-- 라이브러리 테이블이 필요하면 먼저 20260330240000_store_option_catalog.sql 을 적용하세요.

DROP TABLE IF EXISTS store_product_option_links;

DO $f$
BEGIN
  IF to_regclass('public.store_option_groups') IS NOT NULL THEN
    EXECUTE format(
      'COMMENT ON TABLE store_option_groups IS %L',
      '매장 옵션 라이브러리(참고·복사용). 실제 판매 옵션은 각 상품 store_products.options_json'
    );
  END IF;
  IF to_regclass('public.store_option_items') IS NOT NULL THEN
    EXECUTE format(
      'COMMENT ON TABLE store_option_items IS %L',
      '옵션 라이브러리 항목. 상품에는 복사 후 options_json 으로 저장'
    );
  END IF;
END
$f$;
