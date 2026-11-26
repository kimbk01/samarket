-- A-DB 되돌리기 (20271127100000_ad_db_a_promotion_extensions.sql) — Owner 승인 후에만 실행
-- 함수 정의에서 바꾼 문장을 원래대로 되돌리고(역순), 연장 기록 표를 지운다.
-- 주의: 되돌린 뒤의 연장은 다시 주문 행에 더해진다(예전 동작). 표를 지우면 그동안의 연장 기록 행도 사라진다(원장은 그대로).

CREATE OR REPLACE FUNCTION public._ads_adb_a_revert_once(p_name text, p_new text, p_old text, p_marker text)
RETURNS void LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE
  v_oid oid;
  v_def text;
BEGIN
  SELECT p.oid INTO STRICT v_oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = p_name;
  v_def := pg_get_functiondef(v_oid);
  IF position(p_marker IN v_def) = 0 THEN
    RETURN; -- 이미 되돌림
  END IF;
  IF (length(v_def) - length(replace(v_def, p_new, ''))) / greatest(length(p_new), 1) <> 1 THEN
    RAISE EXCEPTION '%: 되돌릴 문장이 정확히 1번 있어야 함', p_name;
  END IF;
  EXECUTE replace(v_def, p_new, p_old);
END $$;

SELECT public._ads_adb_a_revert_once(
  'purchase_member_content_promotion_v2',
  $new$    v_res := v_res || jsonb_build_object('product_revision', v_product.revision);
  END IF;
  -- TB-07 v2 (A-DB 2026-11-27): 연장이면 연장 기록 행에 이번 가격 버전
  IF coalesce((v_res ->> 'ok')::boolean, false)
     AND coalesce((v_res ->> 'extended')::boolean, false)
     AND coalesce((v_res ->> 'idempotent')::boolean, false) IS NOT TRUE THEN
    UPDATE public.point_promotion_order_extensions
       SET product_revision = v_product.revision
     WHERE user_id = p_user_id AND idempotency_key = trim(coalesce(p_idempotency_key, ''));
  END IF;
  RETURN v_res;$new$,
  $old$    v_res := v_res || jsonb_build_object('product_revision', v_product.revision);
  END IF;
  RETURN v_res;$old$,
  'TB-07 v2 (A-DB 2026-11-27)'
);

SELECT public._ads_adb_a_revert_once(
  'purchase_member_community_promotion',
  $new$    'community',
    v_key,
    v_product.revision -- TB-11 값 (A-DB 2026-11-27)
  );$new$,
  $old$    'community',
    v_key
  );$old$,
  'TB-11 값 (A-DB 2026-11-27)'
);

SELECT public._ads_adb_a_revert_once(
  'purchase_member_community_promotion',
  $new$    product_id, domain, idempotency_key, product_revision -- TB-11 (A-DB 2026-11-27)
  ) VALUES ($new$,
  $old$    product_id, domain, idempotency_key
  ) VALUES ($old$,
  'TB-11 (A-DB 2026-11-27)'
);

SELECT public._ads_adb_a_revert_once(
  'purchase_member_community_promotion',
  $new$    -- TB-07 (A-DB 2026-11-27): 연장은 연장 기록 표에 한 줄 — 주문 행은 처음 결제 금액·기간 유지(종료일만 늘림)
    INSERT INTO public.point_promotion_order_extensions (
      order_id, user_id, product_id, product_revision, days, points, ledger_id, idempotency_key
    ) VALUES (
      v_running.id, p_user_id, trim(p_product_id), v_product.revision, p_duration_days, p_point_cost,
      (SELECT l.id FROM public.point_ledger l
        WHERE l.user_id = p_user_id AND l.related_type = 'promotion_order'
          AND l.entry_type = 'promotion_extend' AND l.idempotency_key = v_key
        LIMIT 1),
      v_key
    );
    UPDATE public.point_promotion_orders
       SET end_at = end_at + make_interval(days => p_duration_days)
     WHERE id = v_running.id
     RETURNING end_at INTO v_end;$new$,
  $old$    UPDATE public.point_promotion_orders
       SET end_at = end_at + make_interval(days => p_duration_days),
           duration_days = duration_days + p_duration_days,
           point_cost = point_cost + p_point_cost
     WHERE id = v_running.id
     RETURNING end_at INTO v_end;$old$,
  'TB-07 (A-DB 2026-11-27)'
);

SELECT public._ads_adb_a_revert_once(
  'purchase_member_content_promotion',
  $new$    -- TB-07 (A-DB 2026-11-27): 연장은 연장 기록 표에 한 줄 — 주문 행은 처음 결제 금액·기간 유지(종료일만 늘림)
    INSERT INTO public.point_promotion_order_extensions (
      order_id, user_id, product_id, days, points, ledger_id, idempotency_key
    ) VALUES (
      v_running.id, p_user_id, trim(p_product_id), p_duration_days, p_point_cost,
      (SELECT l.id FROM public.point_ledger l
        WHERE l.user_id = p_user_id AND l.related_type = 'promotion_order'
          AND l.entry_type = 'promotion_extend' AND l.idempotency_key = v_key
        LIMIT 1),
      v_key
    );
    UPDATE public.point_promotion_orders
       SET end_at = end_at + make_interval(days => p_duration_days)
     WHERE id = v_running.id
     RETURNING end_at INTO v_end;$new$,
  $old$    UPDATE public.point_promotion_orders
       SET end_at = end_at + make_interval(days => p_duration_days),
           duration_days = duration_days + p_duration_days,
           point_cost = point_cost + p_point_cost
     WHERE id = v_running.id
     RETURNING end_at INTO v_end;$old$,
  'TB-07 (A-DB 2026-11-27)'
);

DROP FUNCTION public._ads_adb_a_revert_once(text, text, text, text);
DROP TABLE IF EXISTS public.point_promotion_order_extensions;
