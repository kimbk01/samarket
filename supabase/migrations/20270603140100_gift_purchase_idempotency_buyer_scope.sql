-- 상품권 2-D GFT-07 (문서 G-1 §5-D, 2026-10-20) — gift_certificate_purchase 멱등키 구매자 스코프
-- 근거(운영 ckdosyydvgzqwpbwuhon 읽기 전용 조회 2026-10-21 PHT):
--   * 운영 원문 md5(prosrc) = 416cfd27e0a645eb6e211567af58144c (SECURITY DEFINER · owner postgres · search_path=public
--     · ACL {postgres=X/postgres,service_role=X/postgres}).
--   * 키는 point_ledger.related_id / gift_certificate_ledger.related_id / ownership payload / promo 멱등키로 쓰인다.
--     gift_certificate_ledger_related_entry_uq(related_type, related_id, entry_type) 는 사용자 무관 전역 UNIQUE →
--     다른 사용자와 키가 겹치면 unique_violation 처리에서 related_id = 키 로만 찾아 "그 사용자의" 인스턴스 번호를 ok:true 로 반환
--     (본인 POINT 차감은 롤백 = 미구매인데 성공 표시 + 타인 상품권 번호 노출).
-- 수정(최소 diff):
--   * 내부 키 = buyer_user_id || ':' || 입력 키 (신규 행부터. 기존 행 키 형식·값은 그대로 — D-5).
--   * 배포 전 같은 사용자가 쓴 비스코프 키로 재시도하면 기존 인스턴스를 반환(같은 사용자 재시도 멱등 유지, 같은 사용자만 조회).
--   * unique_violation 충돌 조회를 같은 사용자(gl.user_id = p_buyer_user_id)로 한정, 못 찾으면 ok:false purchase_conflict
--     (이전: ok:true + instance_id null).
--   * 본문의 비 ASCII 리터럴 '상품권 구매: ' 는 같은 문자열을 U&'' 이스케이프로 표기(저장 값 동일), 비 ASCII 주석 1줄은 ASCII 로.
--   이외 본문·POINT 차감 원장·발행 카운터·권한은 운영 원문 그대로.
-- 함수 본문에는 비 ASCII 문자를 넣지 않는다 (운영 적용 도구가 멈춤).
-- 롤백: supabase/migrations/20261129230000_gift_certificate_purchase_mall_visible_gate.sql 의 정의(운영 원문과 동일 동작) 재실행.

CREATE OR REPLACE FUNCTION public.gift_certificate_purchase(p_buyer_user_id uuid, p_product_id uuid, p_idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_raw_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  v_key text;
  v_product public.gift_certificate_products%ROWTYPE;
  v_cache integer;
  v_sum integer;
  v_balance_after integer;
  v_instance_id uuid;
  v_public_gift_number text;
  v_existing_instance_id uuid;
  v_now timestamptz := now();
  v_scope text;
  v_issue_date date;
  v_valid_from date;
  v_valid_until date;
  v_gap integer;
  v_store_id uuid;
  v_funding text;
  v_promo jsonb;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_buyer_user_id IS NULL OR p_product_id IS NULL OR v_raw_key IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_args');
  END IF;

  -- GFT-07: idempotency key is scoped per buyer (global unique ledger keys never collide across users).
  v_key := p_buyer_user_id::text || ':' || v_raw_key;

  -- Same-buyer retry of a purchase written before the scoped key (legacy unscoped key).
  SELECT gl.instance_id INTO v_existing_instance_id
    FROM public.gift_certificate_ledger gl
   WHERE gl.related_type = 'gift_certificate_purchase'
     AND gl.related_id = v_raw_key
     AND gl.entry_type = 'ISSUED'
     AND gl.user_id = p_buyer_user_id
   LIMIT 1;
  IF v_existing_instance_id IS NOT NULL THEN
    SELECT i.public_gift_number INTO v_public_gift_number
      FROM public.gift_certificate_instances i
     WHERE i.id = v_existing_instance_id;
    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'instance_id', v_existing_instance_id,
      'public_gift_number', v_public_gift_number
    );
  END IF;

  SELECT * INTO v_product
    FROM public.gift_certificate_products
   WHERE id = p_product_id
     AND active = true
     AND archived_at IS NULL
     AND sales_starts_at <= v_now
     AND (sales_ends_at IS NULL OR sales_ends_at > v_now)
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'product_not_found');
  END IF;
  -- HIDE != PAUSE: Mall visibility required for customer purchase (SSOT with Mall catalog)
  IF coalesce(v_product.mall_visible, true) IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'error', 'product_mall_hidden');
  END IF;
  IF v_product.max_issuance IS NOT NULL
     AND coalesce(v_product.issued_count, 0) >= v_product.max_issuance THEN
    RETURN jsonb_build_object('ok', false, 'error', 'max_issuance_reached');
  END IF;
  IF v_product.purchase_price < 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_price');
  END IF;

  v_scope := coalesce(v_product.gift_scope, 'STORE');
  IF v_scope = 'STORE' AND v_product.store_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_product_scope');
  END IF;
  IF v_scope = 'PLATFORM' AND v_product.store_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_product_scope');
  END IF;

  v_store_id := CASE WHEN v_scope = 'PLATFORM' THEN NULL ELSE v_product.store_id END;
  v_gap := GREATEST(0, v_product.face_value - v_product.purchase_price);
  v_funding := CASE
    WHEN v_gap = 0 THEN 'NONE'
    ELSE coalesce(v_product.discount_funding_party, 'NONE')
  END;

  v_issue_date := public.gift_certificate_issue_date(v_now);
  SELECT r.valid_from, r.valid_until
    INTO v_valid_from, v_valid_until
    FROM public.gift_certificate_resolve_validity_at_issue(
      coalesce(v_product.expiry_policy, 'NO_EXPIRY'),
      v_product.validity_days,
      v_product.fixed_valid_until,
      v_issue_date
    ) r;

  SELECT points INTO v_cache
    FROM public.profiles
   WHERE id = p_buyer_user_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'user_not_found');
  END IF;

  v_sum := public.sum_user_point_ledger(p_buyer_user_id);
  IF coalesce(v_cache, 0) IS DISTINCT FROM GREATEST(0, v_sum) THEN
    PERFORM public.project_user_point_balance_from_ledger(p_buyer_user_id);
    v_sum := public.sum_user_point_ledger(p_buyer_user_id);
  END IF;

  IF GREATEST(0, v_sum) < v_product.purchase_price THEN
    RETURN jsonb_build_object('ok', false, 'error', 'insufficient_balance', 'code', 'insufficient_balance');
  END IF;

  v_balance_after := GREATEST(0, v_sum) - v_product.purchase_price;

  INSERT INTO public.point_ledger (
    user_id, entry_type, amount, balance_after,
    related_type, related_id, description, actor_type
  ) VALUES (
    p_buyer_user_id,
    'spend',
    -v_product.purchase_price,
    v_balance_after,
    'gift_certificate_purchase',
    v_key,
    left(U&'\C0C1\D488\AD8C \AD6C\B9E4: ' || coalesce(v_product.title, ''), 500),
    'user'
  );

  PERFORM public.project_user_point_balance_from_ledger(p_buyer_user_id);

  v_instance_id := gen_random_uuid();
  v_public_gift_number := public.generate_gift_public_number();
  INSERT INTO public.gift_certificate_instances (
    id, public_gift_number, product_id, store_id, gift_scope,
    purchaser_user_id, current_owner_user_id,
    face_value, purchase_price, remaining_balance, status, version,
    valid_from, valid_until,
    purchased_at, created_at,
    purchase_discount_amount, discount_funding_party_snapshot, platform_fee_rate_snapshot
  ) VALUES (
    v_instance_id,
    v_public_gift_number,
    v_product.id,
    v_store_id,
    v_scope,
    p_buyer_user_id,
    p_buyer_user_id,
    v_product.face_value,
    v_product.purchase_price,
    v_product.face_value,
    'ACTIVE',
    1,
    v_valid_from,
    v_valid_until,
    v_now,
    v_now,
    v_gap,
    v_funding,
    v_product.platform_fee_rate
  );

  INSERT INTO public.gift_certificate_ownership_events (
    instance_id, seq, event_type, from_user_id, to_user_id, actor_user_id, payload
  ) VALUES (
    v_instance_id,
    1,
    'PURCHASED',
    NULL,
    p_buyer_user_id,
    p_buyer_user_id,
    jsonb_build_object(
      'product_id', v_product.id,
      'idempotency_key', v_key,
      'gift_scope', v_scope,
      'valid_from', v_valid_from,
      'valid_until', v_valid_until,
      'purchase_discount_amount', v_gap,
      'discount_funding_party', v_funding,
      'platform_fee_rate_snapshot', v_product.platform_fee_rate
    )
  );

  INSERT INTO public.gift_certificate_ledger (
    instance_id, store_id, user_id, entry_type, amount,
    related_type, related_id, description, actor_type
  ) VALUES (
    v_instance_id,
    v_store_id,
    p_buyer_user_id,
    'ISSUED',
    v_product.face_value,
    'gift_certificate_purchase',
    v_key,
    'Gift certificate purchased',
    'user'
  );


  v_promo := public.gift_certificate_promo_accrue_for_instance(
    v_instance_id,
    v_store_id,
    v_gap,
    v_product.merchant_funded_units,
    v_product.platform_funded_units,
    v_funding,
    v_key
  );

  UPDATE public.gift_certificate_products
     SET issued_count = coalesce(issued_count, 0) + 1,
         updated_at = v_now
   WHERE id = v_product.id;

  RETURN jsonb_build_object(
    'ok', true,
    'instance_id', v_instance_id,
    'public_gift_number', v_public_gift_number,
    'gift_scope', v_scope,
    'valid_from', v_valid_from,
    'valid_until', v_valid_until,
    'face_value', v_product.face_value,
    'purchase_price', v_product.purchase_price,
    'purchase_discount_amount', v_gap,
    'discount_funding_party', v_funding,
    'platform_fee_rate_snapshot', v_product.platform_fee_rate,
    'promo', v_promo,
    'balance_after', v_balance_after
  );
EXCEPTION
  WHEN unique_violation THEN
    SELECT gl.instance_id INTO v_existing_instance_id
      FROM public.gift_certificate_ledger gl
     WHERE gl.related_type = 'gift_certificate_purchase'
       AND gl.related_id = v_key
       AND gl.entry_type = 'ISSUED'
       AND gl.user_id = p_buyer_user_id
     LIMIT 1;
    IF v_existing_instance_id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'purchase_conflict');
    END IF;
    SELECT i.public_gift_number INTO v_public_gift_number
      FROM public.gift_certificate_instances i
     WHERE i.id = v_existing_instance_id;
    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'instance_id', v_existing_instance_id,
      'public_gift_number', v_public_gift_number
    );
  WHEN OTHERS THEN
    IF SQLERRM LIKE 'invalid_%' OR SQLERRM LIKE 'fixed_%' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'invalid_product_expiry_policy');
    END IF;
    RAISE;
END;
$function$;

REVOKE ALL ON FUNCTION public.gift_certificate_purchase(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gift_certificate_purchase(uuid, uuid, text) TO service_role;
