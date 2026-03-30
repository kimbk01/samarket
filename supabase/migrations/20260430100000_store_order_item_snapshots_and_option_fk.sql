-- 주문 라인: 기본가·옵션 단가 스냅샷 + 정규화 옵션 행(store_order_item_options)
-- 이 파일만 실행해도 store_order_item_options 가 없으면 생성합니다.
-- (매장 옵션 템플릿 store_option_groups 등은 20260330240000_store_option_catalog.sql 참고)

CREATE TABLE IF NOT EXISTS store_order_item_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id uuid NOT NULL,
  option_group_name_snapshot text NOT NULL,
  option_item_name_snapshot text NOT NULL,
  price_delta_snapshot int NOT NULL DEFAULT 0,
  quantity int NOT NULL DEFAULT 1,
  line_extra_total int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE store_order_item_options IS '주문 라인 옵션 정규화(리포트용). 원본 스냅샷은 store_order_items.options_snapshot_json';

ALTER TABLE store_order_items
  ADD COLUMN IF NOT EXISTS base_price_snapshot integer,
  ADD COLUMN IF NOT EXISTS options_unit_delta_snapshot integer;

COMMENT ON COLUMN store_order_items.base_price_snapshot IS '주문 시점 본품 단가 PHP(할인 후, 옵션 제외)';
COMMENT ON COLUMN store_order_items.options_unit_delta_snapshot IS '주문 시점 1개당 옵션 추가 합계 PHP';

DO $f$
BEGIN
  IF to_regclass('public.store_order_items') IS NULL THEN
    RAISE NOTICE 'store_order_items 가 없어 FK·인덱스를 건너뜁니다.';
    RETURN;
  END IF;

  IF to_regclass('public.store_order_item_options') IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE t.relname = 'store_order_item_options'
      AND c.conname = 'store_order_item_options_order_item_id_fkey'
  ) THEN
    ALTER TABLE store_order_item_options
      ADD CONSTRAINT store_order_item_options_order_item_id_fkey
      FOREIGN KEY (order_item_id) REFERENCES store_order_items (id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_store_order_item_options_order_item'
  ) THEN
    CREATE INDEX idx_store_order_item_options_order_item ON store_order_item_options (order_item_id);
  END IF;
END
$f$;
