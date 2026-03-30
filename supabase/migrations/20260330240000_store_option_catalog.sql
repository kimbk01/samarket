-- 매장 공용 옵션 그룹(재사용) + 상품 연결 + 주문 옵션 정규화(선택)
-- store_products / stores FK 는 배포 DB에 따라 없을 수 있어 생략 — store_id / product_id 는 애플리케이션에서 검증

CREATE TABLE IF NOT EXISTS store_option_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  input_type text NOT NULL CHECK (input_type IN ('radio', 'checkbox', 'select', 'quantity')),
  is_required boolean NOT NULL DEFAULT false,
  min_select int NOT NULL DEFAULT 0,
  max_select int NOT NULL DEFAULT 1,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_store_option_groups_store ON store_option_groups (store_id);

CREATE TABLE IF NOT EXISTS store_option_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  option_group_id uuid NOT NULL REFERENCES store_option_groups (id) ON DELETE CASCADE,
  name text NOT NULL,
  price_delta int NOT NULL DEFAULT 0,
  sort_order int NOT NULL DEFAULT 0,
  is_sold_out boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  name_i18n jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_store_option_items_group ON store_option_items (option_group_id);

CREATE TABLE IF NOT EXISTS store_product_option_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  option_group_id uuid NOT NULL REFERENCES store_option_groups (id) ON DELETE CASCADE,
  sort_order int NOT NULL DEFAULT 0,
  is_required_override boolean,
  min_select_override int,
  max_select_override int,
  price_delta_overrides jsonb,
  UNIQUE (product_id, option_group_id)
);

CREATE INDEX IF NOT EXISTS idx_store_product_option_links_product ON store_product_option_links (product_id);

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

CREATE INDEX IF NOT EXISTS idx_store_order_item_options_item ON store_order_item_options (order_item_id);

COMMENT ON TABLE store_option_groups IS '매장 단위 옵션 템플릿 — 상품 options_json 과 병행 가능';
COMMENT ON TABLE store_order_item_options IS '주문 라인 옵션 정규화(리포트용). 스냅샷은 store_order_items.options_snapshot_json 이 원본.';
