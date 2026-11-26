-- 광고 DB 묶음 A-DB (Owner 「A-DB부터 진행」 2026-11-27) — 상위노출
-- 설계: docs/audit/ad-db-bundle-design-2026-11-27.md A-DB
--
-- TB-07: 연장이 주문 행 `duration_days`·`point_cost` 에 **더해** 처음 결제 기록이 사라졌다
--        (운영 `purchase_member_content_promotion`·`purchase_member_community_promotion` 연장 분기 — 2026-11-27 읽기 전용 확인).
--        → 연장은 새 표 `point_promotion_order_extensions` 에 한 줄씩 쌓고, 주문 행은 종료일(`end_at`)만 늘린다.
--        환급은 지금처럼 원장 합계(`admin_promotion_end`) — 변경 없음.
-- TB-11: 커뮤니티 새 주문이 `product_revision` 을 기록하지 않았다(열은 있음) → 기록.
--        연장 행도 가격 버전을 기록(커뮤니티 = 함수 안 `v_product`, 거래 = v2 래퍼가 결과로 갱신).
-- TB-09(만료 알림)은 DB 변경 없음 — 하루 1회 작업이 알림 `dedupe_key` 로 중복을 막는다(코드).
--
-- 방법: 운영 함수 정의를 읽어 바꿀 문장만 정확히 1번 바꾼다(20271104000000 E-15 와 같은 방식).
--       바꿀 문장이 정확히 1번 없으면 오류로 멈춘다(이미 바뀐 정의면 표시 문구로 건너뜀).
-- 옛 코드 호환: 함수 서명·반환 값 그대로 — 이 마이그레이션만 적용돼도 지금 코드가 그대로 동작한다.
-- 되돌리기: docs/audit/ad-db-a-rollback-2026-11-27.sql

CREATE TABLE IF NOT EXISTS public.point_promotion_order_extensions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.point_promotion_orders(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  product_id text NOT NULL,
  product_revision integer,
  days integer NOT NULL CHECK (days BETWEEN 1 AND 90),
  points integer NOT NULL CHECK (points >= 1),
  ledger_id uuid,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT point_promotion_order_extensions_user_key_uniq UNIQUE (user_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS point_promotion_order_extensions_order_idx
  ON public.point_promotion_order_extensions (order_id, created_at);
ALTER TABLE public.point_promotion_order_extensions ENABLE ROW LEVEL SECURITY;
-- 정책 없음 = 서비스 롤만(결제 함수·서버 API). 회원 화면은 서버 API 로만 읽는다.
REVOKE ALL ON public.point_promotion_order_extensions FROM anon, authenticated;
COMMENT ON TABLE public.point_promotion_order_extensions IS
  '상위노출 연장 기록 (A-DB TB-07) — 주문 행은 처음 결제 금액·기간 유지, 연장은 여기 한 줄씩. 환급은 원장 합계.';

CREATE OR REPLACE FUNCTION public._ads_adb_a_replace_once(p_name text, p_old text, p_new text, p_marker text)
RETURNS void LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE
  v_oid oid;
  v_def text;
BEGIN
  SELECT p.oid INTO STRICT v_oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = p_name;
  v_def := pg_get_functiondef(v_oid);
  IF position(p_marker IN v_def) > 0 THEN
    RETURN; -- 이미 적용됨
  END IF;
  IF (length(v_def) - length(replace(v_def, p_old, ''))) / greatest(length(p_old), 1) <> 1 THEN
    RAISE EXCEPTION '%: 바꿀 문장이 정확히 1번 있어야 함', p_name;
  END IF;
  EXECUTE replace(v_def, p_old, p_new);
END $$;

-- ① 거래 연장 분기 (TB-07)
SELECT public._ads_adb_a_replace_once(
  'purchase_member_content_promotion',
  $old$    UPDATE public.point_promotion_orders
       SET end_at = end_at + make_interval(days => p_duration_days),
           duration_days = duration_days + p_duration_days,
           point_cost = point_cost + p_point_cost
     WHERE id = v_running.id
     RETURNING end_at INTO v_end;$old$,
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
  'TB-07 (A-DB 2026-11-27)'
);

-- ② 커뮤니티 연장 분기 (TB-07 · 가격 버전 포함)
SELECT public._ads_adb_a_replace_once(
  'purchase_member_community_promotion',
  $old$    UPDATE public.point_promotion_orders
       SET end_at = end_at + make_interval(days => p_duration_days),
           duration_days = duration_days + p_duration_days,
           point_cost = point_cost + p_point_cost
     WHERE id = v_running.id
     RETURNING end_at INTO v_end;$old$,
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
  'TB-07 (A-DB 2026-11-27)'
);

-- ③ 커뮤니티 새 주문 가격 버전 (TB-11) — 열 목록
SELECT public._ads_adb_a_replace_once(
  'purchase_member_community_promotion',
  $old$    product_id, domain, idempotency_key
  ) VALUES ($old$,
  $new$    product_id, domain, idempotency_key, product_revision -- TB-11 (A-DB 2026-11-27)
  ) VALUES ($new$,
  'TB-11 (A-DB 2026-11-27)'
);

-- ④ 커뮤니티 새 주문 가격 버전 (TB-11) — 값
SELECT public._ads_adb_a_replace_once(
  'purchase_member_community_promotion',
  $old$    'community',
    v_key
  );$old$,
  $new$    'community',
    v_key,
    v_product.revision -- TB-11 값 (A-DB 2026-11-27)
  );$new$,
  'TB-11 값 (A-DB 2026-11-27)'
);

-- ⑤ 거래 v2 래퍼: 연장이면 연장 기록에 이번 가격 버전 (TB-07)
SELECT public._ads_adb_a_replace_once(
  'purchase_member_content_promotion_v2',
  $old$    v_res := v_res || jsonb_build_object('product_revision', v_product.revision);
  END IF;
  RETURN v_res;$old$,
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
  'TB-07 v2 (A-DB 2026-11-27)'
);

DROP FUNCTION public._ads_adb_a_replace_once(text, text, text, text);
