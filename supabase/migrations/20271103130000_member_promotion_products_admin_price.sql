-- 상위노출 가격 어드민 관리 (Owner 2026-11-03 「1번부터 시작」 · 설계 trade-boost-price-sold-window-design-2026-11-03.md §1)
--
-- 1) member_promotion_products — 상위노출 가격·기간·사용 여부 원본 (처음 값 = 지금 코드 값 그대로 → 적용 직후 앱 가격 변화 0)
-- 2) member_promotion_product_changes — 변경 내역 (지우기·고치기 없음)
-- 3) admin_update_member_promotion_product — 어드민 변경 1건 = 값 + revision + 변경 내역 한 트랜잭션, revision 다르면 중단
-- 4) purchase_member_content_promotion_v2 — 거래 결제: 가격을 표에서 읽고(잠금) 화면에서 본 값과 다르면 결제 없이 price_changed
-- 5) point_promotion_orders.product_revision — 어느 가격 버전으로 산 주문인지 기록 (기존 주문은 null)
--
-- 이미 신청한 주문에는 적용되지 않는다: 주문 행에 point_cost·duration_days·start_at·end_at 이 저장되어 있고,
-- 이 마이그레이션은 기존 주문 행을 고치지 않는다.

-- ── 1) 가격 표 ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.member_promotion_products (
  id text PRIMARY KEY,
  domain text NOT NULL CHECK (domain IN ('trade', 'community')),
  placement text NOT NULL,
  duration_days integer NOT NULL CHECK (duration_days BETWEEN 1 AND 90),
  point_cost integer NOT NULL CHECK (point_cost >= 1),
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  revision integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NULL
);

INSERT INTO public.member_promotion_products (id, domain, placement, duration_days, point_cost, is_active, sort_order)
VALUES
  ('trade_promote_7', 'trade', 'feed_boost', 7, 500, true, 10),
  ('trade_promote_14', 'trade', 'feed_boost', 14, 900, true, 20),
  ('community_promote_3', 'community', 'community_top_pin', 3, 10000, true, 30),
  ('community_promote_7', 'community', 'community_top_pin', 7, 20000, true, 40)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.member_promotion_products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS member_promotion_products_read_active ON public.member_promotion_products;
CREATE POLICY member_promotion_products_read_active ON public.member_promotion_products
  FOR SELECT TO anon, authenticated USING (is_active);

-- ── 2) 변경 내역 ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.member_promotion_product_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id text NOT NULL REFERENCES public.member_promotion_products (id),
  changed_at timestamptz NOT NULL DEFAULT now(),
  admin_id uuid NULL,
  before jsonb NOT NULL,
  after jsonb NOT NULL,
  reason text NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_member_promotion_product_changes_product_time
  ON public.member_promotion_product_changes (product_id, changed_at DESC);
ALTER TABLE public.member_promotion_product_changes ENABLE ROW LEVEL SECURITY;
-- 정책 없음 = 회원·비회원 읽기·쓰기 불가 (서버 키만)

-- ── 5) 주문에 가격 버전 ────────────────────────────────────
ALTER TABLE public.point_promotion_orders
  ADD COLUMN IF NOT EXISTS product_revision integer NULL;

-- ── 3) 어드민 변경 ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_update_member_promotion_product(
  p_id text,
  p_expected_revision integer,
  p_point_cost integer,
  p_duration_days integer,
  p_is_active boolean,
  p_reason text,
  p_admin_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_row public.member_promotion_products%ROWTYPE;
  v_before jsonb;
  v_after jsonb;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF coalesce(length(trim(p_reason)), 0) < 2 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'reason_required');
  END IF;
  IF p_point_cost IS NULL OR p_point_cost < 1 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_point_cost');
  END IF;
  IF p_duration_days IS NULL OR p_duration_days < 1 OR p_duration_days > 90 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_duration');
  END IF;

  SELECT * INTO v_row FROM public.member_promotion_products WHERE id = trim(p_id) FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;
  IF v_row.revision IS DISTINCT FROM p_expected_revision THEN
    RETURN jsonb_build_object('ok', false, 'error', 'revision_conflict', 'revision', v_row.revision);
  END IF;
  IF v_row.point_cost = p_point_cost
     AND v_row.duration_days = p_duration_days
     AND v_row.is_active = coalesce(p_is_active, v_row.is_active) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_change');
  END IF;

  v_before := jsonb_build_object(
    'point_cost', v_row.point_cost, 'duration_days', v_row.duration_days,
    'is_active', v_row.is_active, 'revision', v_row.revision
  );

  UPDATE public.member_promotion_products
     SET point_cost = p_point_cost,
         duration_days = p_duration_days,
         is_active = coalesce(p_is_active, is_active),
         revision = revision + 1,
         updated_at = now(),
         updated_by = p_admin_id
   WHERE id = v_row.id
  RETURNING * INTO v_row;

  v_after := jsonb_build_object(
    'point_cost', v_row.point_cost, 'duration_days', v_row.duration_days,
    'is_active', v_row.is_active, 'revision', v_row.revision
  );

  INSERT INTO public.member_promotion_product_changes (product_id, admin_id, before, after, reason)
  VALUES (v_row.id, p_admin_id, v_before, v_after, left(trim(p_reason), 500));

  RETURN jsonb_build_object('ok', true, 'before', v_before, 'after', v_after);
END;
$$;

-- ── 4) 거래 결제 (가격 재확인) ─────────────────────────────
CREATE OR REPLACE FUNCTION public.purchase_member_content_promotion_v2(
  p_user_id uuid,
  p_target_id text,
  p_product_id text,
  p_expected_point_cost integer,
  p_expected_duration_days integer,
  p_idempotency_key text,
  p_user_nickname text DEFAULT '',
  p_target_title text DEFAULT ''
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_product public.member_promotion_products%ROWTYPE;
  v_existing_id uuid;
  v_res jsonb;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  -- 같은 요청 다시 보내기: 가격이 그 사이 바뀌었어도 이미 만든 주문을 그대로 돌려준다 (두 번 차감 없음)
  SELECT id INTO v_existing_id
    FROM public.point_promotion_orders
   WHERE user_id = p_user_id AND idempotency_key = trim(coalesce(p_idempotency_key, ''))
   LIMIT 1;
  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true, 'idempotent', true, 'order_id', v_existing_id,
      'balance_after', public.project_user_point_balance_from_ledger(p_user_id)
    );
  END IF;

  -- FOR SHARE: 결제 중에는 어드민 변경(FOR UPDATE)이 기다린다
  SELECT * INTO v_product
    FROM public.member_promotion_products
   WHERE id = trim(coalesce(p_product_id, ''))
   FOR SHARE;
  IF NOT FOUND OR v_product.domain <> 'trade' OR NOT v_product.is_active THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_product');
  END IF;
  IF v_product.point_cost IS DISTINCT FROM p_expected_point_cost
     OR v_product.duration_days IS DISTINCT FROM p_expected_duration_days THEN
    RETURN jsonb_build_object(
      'ok', false, 'error', 'price_changed',
      'point_cost', v_product.point_cost,
      'duration_days', v_product.duration_days,
      'revision', v_product.revision
    );
  END IF;

  v_res := public.purchase_member_content_promotion(
    p_user_id, p_target_id, v_product.id, v_product.point_cost, v_product.duration_days,
    v_product.placement, v_product.domain, p_idempotency_key, p_user_nickname, p_target_title
  );

  IF coalesce((v_res ->> 'ok')::boolean, false)
     AND coalesce((v_res ->> 'idempotent')::boolean, false) IS NOT TRUE
     AND (v_res ->> 'order_id') IS NOT NULL THEN
    UPDATE public.point_promotion_orders
       SET product_revision = v_product.revision
     WHERE id = (v_res ->> 'order_id')::uuid;
    v_res := v_res || jsonb_build_object('product_revision', v_product.revision);
  END IF;
  RETURN v_res;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_member_promotion_product(text, integer, integer, integer, boolean, text, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_member_promotion_product(text, integer, integer, integer, boolean, text, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.purchase_member_content_promotion_v2(uuid, text, text, integer, integer, text, text, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purchase_member_content_promotion_v2(uuid, text, text, integer, integer, text, text, text) TO service_role;
