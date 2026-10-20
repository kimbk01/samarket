-- 1-J 격리 DB 단언 (00_fixture.sql + 마이그레이션 20270602130000 적용 후 실행 · 러너는 00_fixture.sql 머리)
-- 실패 시 RAISE EXCEPTION → psql ON_ERROR_STOP=1 로 비정상 종료.

SET request.jwt.claim.role = 'service_role';

CREATE OR REPLACE FUNCTION pg_temp.ok(cond boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF cond IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FAIL: %', label;
  END IF;
  RAISE NOTICE 'PASS: %', label;
END;
$$;

-- 주문 RPC 호출 헬퍼 (픽업 · 쿠폰/상품권 없음 · 단가 = 할인 반영 기준가)
CREATE OR REPLACE FUNCTION pg_temp.order1(p_product uuid, p_qty int, p_unit numeric, p_key text) RETURNS jsonb
LANGUAGE sql AS $$
  SELECT public.create_store_order_atomic(
    '00000000-0000-0000-0000-0000000000e1'::uuid,
    '00000000-0000-0000-0000-0000000000a1'::uuid,
    p_key,
    jsonb_build_object('payment_amount', p_unit * p_qty, 'total_amount', p_unit * p_qty, 'fulfillment_type', 'pickup',
                       'order_no', 'ISO-' || p_key),
    jsonb_build_array(jsonb_build_object(
      'product_id', p_product, 'qty', p_qty, 'unit', p_unit,
      'base_unit_after_discount', p_unit, 'unit_options_delta', 0,
      'subtotal', p_unit * p_qty, 'title', 'iso'))
  )
$$;

CREATE OR REPLACE FUNCTION pg_temp.mkprod(p_id text, p_status text, p_review text, p_section text, p_stock int)
RETURNS uuid LANGUAGE sql AS $$
  INSERT INTO public.store_products (id, store_id, title, price, product_status, admin_review_status,
                                     menu_section_id, track_inventory, stock_qty)
  VALUES (p_id::uuid, '00000000-0000-0000-0000-0000000000a1', 'p-' || p_id, 100, p_status, p_review,
          p_section::uuid, p_stock IS NOT NULL, coalesce(p_stock, 0))
  RETURNING id
$$;

-- ── 스키마 · CHECK ─────────────────────────────────────────────
SELECT pg_temp.ok(
  (SELECT convalidated FROM pg_constraint WHERE conname = 'store_products_discount_lt_price'),
  'discount CHECK validated (no historical violation)');
SELECT pg_temp.ok(
  (SELECT sold_out_reason IS NULL AND admin_status_lock IS NULL FROM public.store_products
    WHERE id = '00000000-0000-0000-0000-00000000d0ff'),
  'legacy rows not backfilled (D-5)');

SELECT pg_temp.mkprod('00000000-0000-0000-0000-00000000d001', 'active', 'none', '00000000-0000-0000-0000-00000000c001', NULL);

DO $$
BEGIN
  BEGIN
    UPDATE public.store_products SET discount_price = 100 WHERE id = '00000000-0000-0000-0000-00000000d001';
    RAISE EXCEPTION 'FAIL: discount_price = price accepted';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS: discount_price >= price rejected';
  END;
  BEGIN
    UPDATE public.store_products SET discount_price = 150 WHERE id = '00000000-0000-0000-0000-00000000d001';
    RAISE EXCEPTION 'FAIL: discount_price > price accepted';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS: discount_price > price rejected';
  END;
  -- admin correct_price without recompute (old bug) must now fail at DB
  UPDATE public.store_products SET discount_price = 90 WHERE id = '00000000-0000-0000-0000-00000000d001';
  BEGIN
    UPDATE public.store_products SET price = 80 WHERE id = '00000000-0000-0000-0000-00000000d001';
    RAISE EXCEPTION 'FAIL: price lowered below discount accepted';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS: price below existing discount rejected';
  END;
  UPDATE public.store_products SET price = 0, discount_price = 0 WHERE id = '00000000-0000-0000-0000-00000000d001';
  RAISE NOTICE 'PASS: free product (price 0) with discount 0 allowed';
  UPDATE public.store_products SET price = 100, discount_price = NULL WHERE id = '00000000-0000-0000-0000-00000000d001';
  BEGIN
    UPDATE public.store_products SET sold_out_reason = 'other' WHERE id = '00000000-0000-0000-0000-00000000d001';
    RAISE EXCEPTION 'FAIL: bad sold_out_reason accepted';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS: sold_out_reason CHECK';
  END;
  BEGIN
    UPDATE public.store_products SET admin_status_lock = 'active' WHERE id = '00000000-0000-0000-0000-00000000d001';
    RAISE EXCEPTION 'FAIL: bad admin_status_lock accepted';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS: admin_status_lock CHECK';
  END;
END
$$;

-- ── 주문 RPC: 정상 · 검수 · 숨김 구역 · 잠금 ─────────────────────
SELECT pg_temp.ok((pg_temp.order1('00000000-0000-0000-0000-00000000d001', 1, 100, 'k-normal')->>'ok')::boolean,
  'order: active/none product ok');

SELECT pg_temp.mkprod('00000000-0000-0000-0000-00000000d002', 'active', 'pending', '00000000-0000-0000-0000-00000000c001', NULL);
SELECT pg_temp.ok(pg_temp.order1('00000000-0000-0000-0000-00000000d002', 1, 100, 'k-pending')->>'error' = 'product_not_available',
  'order: re-review pending product rejected (PRD-03)');

SELECT pg_temp.mkprod('00000000-0000-0000-0000-00000000d003', 'active', 'rejected', '00000000-0000-0000-0000-00000000c001', NULL);
SELECT pg_temp.ok(pg_temp.order1('00000000-0000-0000-0000-00000000d003', 1, 100, 'k-rejected')->>'error' = 'product_not_available',
  'order: review rejected product rejected even if status active (PRD-03)');

SELECT pg_temp.mkprod('00000000-0000-0000-0000-00000000d004', 'active', 'approved', '00000000-0000-0000-0000-00000000c001', NULL);
SELECT pg_temp.ok((pg_temp.order1('00000000-0000-0000-0000-00000000d004', 1, 100, 'k-approved')->>'ok')::boolean,
  'order: approved review product ok');

SELECT pg_temp.mkprod('00000000-0000-0000-0000-00000000d005', 'active', 'none', '00000000-0000-0000-0000-00000000c002', NULL);
SELECT pg_temp.ok(pg_temp.order1('00000000-0000-0000-0000-00000000d005', 1, 100, 'k-hidden')->>'error' = 'product_not_available',
  'order: product in hidden section rejected (PRD-05)');
UPDATE public.store_menu_sections SET is_hidden = false WHERE id = '00000000-0000-0000-0000-00000000c002';
SELECT pg_temp.ok((pg_temp.order1('00000000-0000-0000-0000-00000000d005', 1, 100, 'k-unhidden')->>'ok')::boolean,
  'order: section unhidden -> orderable again');
UPDATE public.store_menu_sections SET is_hidden = true WHERE id = '00000000-0000-0000-0000-00000000c002';

SELECT pg_temp.mkprod('00000000-0000-0000-0000-00000000d006', 'active', 'none', NULL, NULL);
SELECT pg_temp.ok((pg_temp.order1('00000000-0000-0000-0000-00000000d006', 1, 100, 'k-nosection')->>'ok')::boolean,
  'order: product without section ok (기타 메뉴 불변)');

-- ND-1: lock only gates owner writes; buyer order depends on status (locked statuses are never active)
SELECT pg_temp.mkprod('00000000-0000-0000-0000-00000000d007', 'hidden', 'none', '00000000-0000-0000-0000-00000000c001', NULL);
UPDATE public.store_products SET admin_status_lock = 'hidden' WHERE id = '00000000-0000-0000-0000-00000000d007';
SELECT pg_temp.ok(pg_temp.order1('00000000-0000-0000-0000-00000000d007', 1, 100, 'k-lock-hidden')->>'error' = 'product_not_available',
  'order: admin-hidden (locked) product not orderable');
UPDATE public.store_products SET product_status = 'sold_out', sold_out_reason = 'admin', admin_status_lock = 'sold_out'
 WHERE id = '00000000-0000-0000-0000-00000000d007';
SELECT pg_temp.ok(pg_temp.order1('00000000-0000-0000-0000-00000000d007', 1, 100, 'k-lock-so')->>'error' = 'product_sold_out',
  'order: admin sold_out (locked) product -> product_sold_out');

-- discount price is the authoritative unit (PRD-04 연동)
SELECT pg_temp.mkprod('00000000-0000-0000-0000-00000000d008', 'active', 'none', '00000000-0000-0000-0000-00000000c001', NULL);
UPDATE public.store_products SET discount_price = 90, discount_percent = 10 WHERE id = '00000000-0000-0000-0000-00000000d008';
SELECT pg_temp.ok(pg_temp.order1('00000000-0000-0000-0000-00000000d008', 1, 100, 'k-disc-wrong')->>'error' = 'price_changed',
  'order: list price with active discount -> price_changed');
SELECT pg_temp.ok((pg_temp.order1('00000000-0000-0000-0000-00000000d008', 1, 90, 'k-disc-ok')->>'ok')::boolean,
  'order: discounted unit ok');

-- ── 재고 차감 → stock 품절 · 멱등 ────────────────────────────────
SELECT pg_temp.mkprod('00000000-0000-0000-0000-00000000d010', 'active', 'none', '00000000-0000-0000-0000-00000000c001', 2);
SELECT pg_temp.ok((pg_temp.order1('00000000-0000-0000-0000-00000000d010', 2, 100, 'k-stock')->>'ok')::boolean,
  'order: last stock consumed');
SELECT pg_temp.ok(
  (SELECT product_status = 'sold_out' AND sold_out_reason = 'stock' AND stock_qty = 0
     FROM public.store_products WHERE id = '00000000-0000-0000-0000-00000000d010'),
  'order: stock 0 -> sold_out with reason stock (PRD-06)');
SELECT pg_temp.ok((pg_temp.order1('00000000-0000-0000-0000-00000000d010', 2, 100, 'k-stock')->>'idempotent')::boolean,
  'order: same client_order_key -> idempotent replay');
SELECT pg_temp.ok((SELECT count(*) = 1 FROM public.store_orders WHERE client_order_key = 'k-stock'),
  'order: duplicate key created no second order');
SELECT pg_temp.ok(pg_temp.order1('00000000-0000-0000-0000-00000000d010', 1, 100, 'k-stock-2')->>'error' = 'product_sold_out',
  'order: stock-sold-out product not orderable');

-- ── 재고 복원 매트릭스 (stock / manual / admin / NULL / lock / review) ───────
-- 각 상품: 재고 1 → 주문 1 → stock 품절 → (시나리오별 상태 조정) → 주문 취소 복원
CREATE TEMP TABLE restore_case (pid uuid, okey text, expect_status text, expect_reason text, label text);

DO $$
DECLARE
  c record;
  r jsonb;
BEGIN
  FOR c IN SELECT * FROM (VALUES
    ('00000000-0000-0000-0000-00000000f001'::uuid, 'r-stock',  'stock',  NULL::text, false, 'none',    'active',   NULL,     'restore: stock sold_out -> active, reason cleared'),
    ('00000000-0000-0000-0000-00000000f002'::uuid, 'r-manual', 'manual', NULL,       false, 'none',    'sold_out', 'manual', 'restore: manual sold_out stays sold_out'),
    ('00000000-0000-0000-0000-00000000f003'::uuid, 'r-admin',  'admin',  'sold_out', false, 'none',    'sold_out', 'admin',  'restore: admin sold_out stays sold_out'),
    ('00000000-0000-0000-0000-00000000f004'::uuid, 'r-null',   NULL,     NULL,       true,  'none',    'sold_out', NULL,     'restore: legacy NULL reason stays sold_out'),
    ('00000000-0000-0000-0000-00000000f005'::uuid, 'r-lock',   'stock',  'hidden',   false, 'none',    'sold_out', 'stock',  'restore: stock but admin-locked stays sold_out'),
    ('00000000-0000-0000-0000-00000000f006'::uuid, 'r-review', 'stock',  NULL,       false, 'pending', 'sold_out', 'stock',  'restore: stock but review pending stays sold_out')
  ) AS t(pid, okey, reason, lock, legacy_null, review, exp_status, exp_reason, label)
  LOOP
    PERFORM pg_temp.mkprod(c.pid::text, 'active', 'none', '00000000-0000-0000-0000-00000000c001', 1);
    r := pg_temp.order1(c.pid, 1, 100, c.okey);
    IF NOT (r->>'ok')::boolean THEN
      RAISE EXCEPTION 'FAIL: setup order % -> %', c.okey, r;
    END IF;
    UPDATE public.store_products
       SET sold_out_reason = CASE WHEN c.legacy_null THEN NULL ELSE c.reason END,
           admin_status_lock = c.lock,
           admin_review_status = c.review
     WHERE id = c.pid;
    INSERT INTO restore_case VALUES (c.pid, c.okey, c.exp_status, c.exp_reason, c.label);
  END LOOP;
END
$$;

DO $$
DECLARE
  c record;
  r jsonb;
  p record;
BEGIN
  FOR c IN SELECT * FROM restore_case LOOP
    r := public.restore_store_order_stock_atomic((SELECT id FROM public.store_orders WHERE client_order_key = c.okey));
    IF NOT (r->>'ok')::boolean OR (r->>'idempotent')::boolean THEN
      RAISE EXCEPTION 'FAIL: % rpc -> %', c.label, r;
    END IF;
    SELECT product_status, sold_out_reason, stock_qty INTO p FROM public.store_products WHERE id = c.pid;
    IF p.stock_qty <> 1 OR p.product_status <> c.expect_status OR p.sold_out_reason IS DISTINCT FROM c.expect_reason THEN
      RAISE EXCEPTION 'FAIL: % -> status=% reason=% qty=%', c.label, p.product_status, p.sold_out_reason, p.stock_qty;
    END IF;
    RAISE NOTICE 'PASS: % (qty restored 0->1)', c.label;
  END LOOP;
END
$$;

SELECT pg_temp.ok(
  (public.restore_store_order_stock_atomic((SELECT id FROM public.store_orders WHERE client_order_key = 'r-stock'))->>'idempotent')::boolean,
  'restore: second call idempotent');
SELECT pg_temp.ok(
  (SELECT stock_qty = 1 FROM public.store_products WHERE id = '00000000-0000-0000-0000-00000000f001'),
  'restore: idempotent call did not double-restore');

SET request.jwt.claim.role = 'authenticated';
SELECT pg_temp.ok(
  public.restore_store_order_stock_atomic((SELECT id FROM public.store_orders WHERE client_order_key = 'r-manual'))->>'error' = 'forbidden',
  'restore: non service_role forbidden');
SET request.jwt.claim.role = 'service_role';

-- ── 메뉴 스냅샷: 검수 반려·재검수 대기 제외 · 숨김 구역 플래그 유지 ─────────
DO $$
DECLARE
  snap jsonb := public.get_store_menus_snapshot('iso-store', NULL, 'default');
  ids text[];
BEGIN
  SELECT array_agg(x->>'id') INTO ids FROM jsonb_array_elements(snap->'products') x;
  IF '00000000-0000-0000-0000-00000000d002' = ANY(ids) OR '00000000-0000-0000-0000-00000000d003' = ANY(ids) THEN
    RAISE EXCEPTION 'FAIL: snapshot exposes pending/rejected products';
  END IF;
  IF NOT ('00000000-0000-0000-0000-00000000d001' = ANY(ids) AND '00000000-0000-0000-0000-00000000d004' = ANY(ids)) THEN
    RAISE EXCEPTION 'FAIL: snapshot missing none/approved products %', ids;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(snap->'products') x
     WHERE x->>'id' = '00000000-0000-0000-0000-00000000d005'
       AND (x->'store_menu_sections'->>'is_hidden')::boolean
  ) THEN
    RAISE EXCEPTION 'FAIL: hidden-section flag not carried for TS filter';
  END IF;
  RAISE NOTICE 'PASS: menu snapshot excludes pending/rejected, keeps none/approved + is_hidden flag';
END
$$;

SELECT pg_temp.ok(public.get_store_menus_snapshot('no-such-store', NULL, 'default') IS NULL, 'menu snapshot: unknown slug -> NULL');

\echo 'ALL 1-J ISOLATED ASSERTIONS PASSED'
