-- 배달 오너 감사 2단계 2-A · FIN-08 (2/2) R-D5 legacy_preserved 분류 (문서 G-1 §5-A FIN-08 3번 두 번째 항목, D-5)
-- 의존(적용 순서): 20270603110200 (store_commission_d5_legacy_cutoff · store_commission_cash_account_is_d5_legacy)
--   + 2-B 20270603120200_stage2b_gft02_integrity_sale_coin_cap.sql (store_commission_integrity_report 재정의) 이후.
--   이 파일 이름(125000)이 2-B 뒤에 정렬되도록 했다. 2-B 가 아직 적용되지 않은 DB 에 먼저 적용하면 2-B 의
--   'sale_coin_le_platform_coupon' 검사가 이 파일 본문에 이미 포함되어 있으므로 결과는 같다(2-B 파일 재적용 시에는 이 파일도 다시 적용).
-- D-5: 과거 데이터는 정리·정정하지 않는다. 기준 시각 2026-10-20 20:30 UTC 이전 위반은 legacy_preserved 로 분류만 하고
--   예외 알림에서 제외 — 값은 그대로, 이후 신규 위반만 알림.
--   * store_commission_integrity_report: 기존 키의 'violations'/'ids' 그대로 + 'legacy_preserved'/'new_violations'/'new_ids'
--     추가, 'legacy_cutoff' 추가. 2-B 의 'sale_coin_le_platform_coupon'(자체 legacy 분류) 은 그대로 유지.
--   * store_commission_enqueue_exception_notifications: §2 잔액 불일치(기준 이후 잔액·원장 변동 없는 계정 제외),
--     §3 의무 위반('new_ids' 사용), §4 지급 의심(기준 이전 생성 주문 제외).
-- 기준 본문:
--   public.store_commission_integrity_report(uuid[])          base = 2-B 본문 md5(prosrc) = e4d32a11b5e3a20729beb319e2f19f2d
--                                                              (2-B 의 운영 base = b7871c44f74347ddd6d9e26fb1115270)
--   public.store_commission_enqueue_exception_notifications() base = 운영 원문 md5(prosrc) = f0ddf348b806878d65887c4649c0a7c8
--   (알림 함수 원문의 한글 문구는 ASCII 규정에 맞춰 E'\uXXXX' 이스케이프로 옮겼다 — 실행 시 문자열은 원문과 동일.
--    원문 주석의 비 ASCII 기호(≠)는 '<>' 로 바꿨다.)
-- 함수 본문에는 비 ASCII 를 넣지 않는다 (운영 적용 도구가 멈춤).
-- 롤백: store_commission_integrity_report 는 2-B 본문(md5 e4d32a11…, 20270603120200)으로,
--       store_commission_enqueue_exception_notifications 는 운영 원문(md5 f0ddf348…)으로 CREATE OR REPLACE.

CREATE OR REPLACE FUNCTION public.store_commission_integrity_report(p_store_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH ob AS (
    SELECT * FROM public.store_sale_fee_obligations
     WHERE p_store_ids IS NULL OR store_id = ANY (p_store_ids)
  ),
  i1 AS (  -- charged = remaining due + approved adjustments
    SELECT ob.id FROM ob LEFT JOIN public.store_commission_adjustments a ON a.obligation_id = ob.id
     WHERE ob.original_fee_due_minor IS NOT NULL
       AND ob.original_fee_due_minor <> ob.fee_due_minor + coalesce(a.approved_minor, 0)
  ),
  i2 AS (  -- Cash actually taken for the order = fee_paid_minor
    SELECT ob.id FROM ob
     WHERE ob.fee_paid_minor <> (
       coalesce((SELECT sum(l.amount_minor) FROM public.business_cash_ledger l
                  WHERE l.entry_kind = 'SALE_FEE' AND l.related_type = 'store_order' AND l.related_id = ob.order_id::text), 0)
     + coalesce((SELECT sum(l.amount_minor) FROM public.business_cash_ledger l
                  WHERE l.entry_kind = 'SALE_FEE_SETTLEMENT' AND l.related_id = ob.id::text), 0)
     - coalesce((SELECT sum(l.amount_minor) FROM public.business_cash_ledger l
                  WHERE l.entry_kind = 'SALE_FEE_REVERSAL'
                    AND (l.related_id = ob.order_id::text
                         OR l.related_id IN (SELECT a.id::text FROM public.store_commission_adjustments a WHERE a.obligation_id = ob.id))), 0))
  ),
  i3 AS (  -- status matches amounts
    SELECT ob.id FROM ob
     WHERE (ob.status = 'open' AND ob.fee_outstanding_minor = 0)
        OR (ob.status = 'settled' AND ob.fee_outstanding_minor <> 0)
        OR (ob.status = 'waived' AND ob.fee_due_minor <> 0)
  ),
  i4 AS (  -- closed order with a live fee must be in review or decided
    SELECT ob.id FROM ob JOIN public.store_orders o ON o.id = ob.order_id
     WHERE o.order_status IN ('cancelled', 'refunded') AND ob.adjustment_status = 'none'
       AND ob.status <> 'waived' AND ob.fee_due_minor > 0
  ),
  acct AS (
    SELECT a.store_id, a.balance_minor,
           (SELECT coalesce(sum(CASE WHEN l.direction = 'credit' THEN l.amount_minor ELSE -l.amount_minor END), 0)
              FROM public.business_cash_ledger l WHERE l.store_id = a.store_id) AS ledger_sum,
           public.store_commission_cash_account_is_d5_legacy(a.store_id, a.updated_at) AS d5_legacy
      FROM public.business_cash_accounts a
     WHERE p_store_ids IS NULL OR a.store_id = ANY (p_store_ids)
  ),
  i6 AS (SELECT store_id, d5_legacy FROM acct WHERE balance_minor <> ledger_sum),
  i7 AS (SELECT id FROM ob WHERE original_fee_due_minor IS NULL),
  ic AS (  -- GFT-02: sale Coin per order <= platform_funded_amount (option A); pre-cutoff rows = legacy_preserved
    SELECT e.related_id AS order_id,
           e.created_at < '2026-10-20 20:30:00+00'::timestamptz AS legacy
      FROM public.store_economic_point_ledger e
      LEFT JOIN public.store_orders o ON o.id::text = e.related_id
     WHERE e.idempotency_key LIKE 'sale_coin:%'
       AND (p_store_ids IS NULL OR e.store_id = ANY (p_store_ids))
       AND e.amount > GREATEST(0, trunc(coalesce(o.platform_funded_amount, 0)))
  ),
  -- FIN-08 R-D5: violations on obligations created before the cutoff (cash accounts untouched since it) are
  -- classified legacy_preserved (values untouched); 'violations'/'ids' keep the full picture,
  -- 'new_violations'/'new_ids' drive exception alerts.
  v AS (
    SELECT 'charged_eq_due_plus_adjustments'::text AS chk, ob.id, ob.created_at < public.store_commission_d5_legacy_cutoff() AS d5_legacy
      FROM i1 JOIN ob ON ob.id = i1.id
    UNION ALL
    SELECT 'cash_ledger_eq_fee_paid', ob.id, ob.created_at < public.store_commission_d5_legacy_cutoff() FROM i2 JOIN ob ON ob.id = i2.id
    UNION ALL
    SELECT 'status_matches_amounts', ob.id, ob.created_at < public.store_commission_d5_legacy_cutoff() FROM i3 JOIN ob ON ob.id = i3.id
    UNION ALL
    SELECT 'closed_orders_reviewed', ob.id, ob.created_at < public.store_commission_d5_legacy_cutoff() FROM i4 JOIN ob ON ob.id = i4.id
    UNION ALL
    SELECT 'balance_eq_ledger_sum', i6.store_id, i6.d5_legacy FROM i6
  ),
  agg AS (
    SELECT c.chk,
           jsonb_build_object(
             'violations', (SELECT count(*) FROM v WHERE v.chk = c.chk),
             'ids', (SELECT coalesce(jsonb_agg(id), '[]') FROM (SELECT id FROM v WHERE v.chk = c.chk LIMIT 50) x),
             'legacy_preserved', (SELECT count(*) FROM v WHERE v.chk = c.chk AND v.d5_legacy),
             'new_violations', (SELECT count(*) FROM v WHERE v.chk = c.chk AND NOT v.d5_legacy),
             'new_ids', (SELECT coalesce(jsonb_agg(id), '[]') FROM (SELECT id FROM v WHERE v.chk = c.chk AND NOT v.d5_legacy LIMIT 50) x)
           ) AS body
      FROM unnest(ARRAY['charged_eq_due_plus_adjustments', 'cash_ledger_eq_fee_paid', 'status_matches_amounts',
                        'closed_orders_reviewed', 'balance_eq_ledger_sum']) AS c(chk)
  )
  SELECT jsonb_build_object(
    'obligations', (SELECT count(*) FROM ob),
    'charged_eq_due_plus_adjustments', (SELECT body FROM agg WHERE chk = 'charged_eq_due_plus_adjustments'),
    'cash_ledger_eq_fee_paid', (SELECT body FROM agg WHERE chk = 'cash_ledger_eq_fee_paid'),
    'status_matches_amounts', (SELECT body FROM agg WHERE chk = 'status_matches_amounts'),
    'closed_orders_reviewed', (SELECT body FROM agg WHERE chk = 'closed_orders_reviewed'),
    'balance_eq_ledger_sum', (SELECT body FROM agg WHERE chk = 'balance_eq_ledger_sum'),
    'original_unknown', jsonb_build_object('count', (SELECT count(*) FROM i7), 'ids', (SELECT coalesce(jsonb_agg(id), '[]') FROM (SELECT id FROM i7 LIMIT 50) x)),
    'sale_coin_le_platform_coupon', jsonb_build_object(
      'violations', (SELECT count(*) FROM ic WHERE NOT legacy),
      'ids', (SELECT coalesce(jsonb_agg(order_id), '[]') FROM (SELECT order_id FROM ic WHERE NOT legacy LIMIT 50) x),
      'legacy_preserved', (SELECT count(*) FROM ic WHERE legacy),
      'legacy_ids', (SELECT coalesce(jsonb_agg(order_id), '[]') FROM (SELECT order_id FROM ic WHERE legacy LIMIT 50) x)),
    'legacy_cutoff', public.store_commission_d5_legacy_cutoff()
  );
$function$;

CREATE OR REPLACE FUNCTION public.store_commission_enqueue_exception_notifications()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_review integer := 0;
  v_mismatch integer := 0;
  v_integrity integer := 0;
  v_payout integer := 0;
  v_report jsonb;
  v_check text;
  v_label text;
  r record;
BEGIN
  IF to_regclass('public.admin_notification_outbox') IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'skipped', 'admin_notification_outbox_missing');
  END IF;

  -- 1) Open reviews whose alert never reached the outbox (e.g. enqueue failed in the trigger).
  FOR r IN
    SELECT ob.id FROM public.store_sale_fee_obligations ob
     WHERE ob.adjustment_status = 'review_required'
       AND NOT EXISTS (SELECT 1 FROM public.admin_notification_outbox x WHERE x.source_key = 'settlement_review:' || ob.id::text)
     ORDER BY ob.review_flagged_at NULLS LAST
     LIMIT 500
  LOOP
    IF public.store_commission_notify_review(r.id) THEN v_review := v_review + 1; END IF;
  END LOOP;

  -- 2) Cash balance <> ledger sum (keyed by store + current difference: a new difference = a new event).
  FOR r IN
    SELECT a.store_id, s.store_name, a.balance_minor,
           coalesce((SELECT sum(CASE WHEN l.direction = 'credit' THEN l.amount_minor ELSE -l.amount_minor END)
                       FROM public.business_cash_ledger l WHERE l.store_id = a.store_id), 0)::bigint AS ledger_sum,
           public.store_commission_cash_account_is_d5_legacy(a.store_id, a.updated_at) AS d5_legacy
      FROM public.business_cash_accounts a
      JOIN public.stores s ON s.id = a.store_id
  LOOP
    CONTINUE WHEN r.balance_minor = r.ledger_sum;
    -- R-D5: a mismatch untouched since the cutoff is preserved as-is (reported, not alerted).
    CONTINUE WHEN r.d5_legacy;
    IF public.store_commission_notify_admin(
         'settlement_exception:balance_mismatch:' || r.store_id::text || ':' || (r.balance_minor - r.ledger_sum)::text,
         'settlement_financial_exception', 'critical',
         E'[\uC6D0\uC7A5 \uBD88\uC77C\uCE58] ' || coalesce(r.store_name, r.store_id::text),
         E'\uCE90\uC2DC \uC794\uC561 ' || public.store_commission_php_text(r.balance_minor) || E' \u2260 \uC6D0\uC7A5 \uD569\uACC4 ' || public.store_commission_php_text(r.ledger_sum)
           || E' (\uCC28\uC774 ' || public.store_commission_php_text(r.balance_minor - r.ledger_sum) || E') \u00B7 \uADFC\uAC70 \uD655\uC778 \uC804 \uC784\uC758 \uC815\uC815 \uAE08\uC9C0',
         '/admin/store-settlements?tab=exceptions&store_id=' || r.store_id::text,
         'stores', r.store_id::text) THEN
      v_mismatch := v_mismatch + 1;
    END IF;
  END LOOP;

  -- 3) Obligation-level integrity violations (cash ledger <> fee paid = double charge / double refund suspect).
  v_report := public.store_commission_integrity_report(NULL);
  FOREACH v_check IN ARRAY ARRAY['charged_eq_due_plus_adjustments', 'cash_ledger_eq_fee_paid', 'status_matches_amounts', 'closed_orders_reviewed']
  LOOP
    v_label := CASE v_check
      WHEN 'cash_ledger_eq_fee_paid' THEN E'\uC774\uC911 \uCC28\uAC10\u00B7\uD658\uAE09 \uC758\uC2EC (\uCE90\uC2DC \uC6D0\uC7A5 \u2260 \uC218\uC218\uB8CC \uB0A9\uBD80\uC561)'
      WHEN 'charged_eq_due_plus_adjustments' THEN E'\uBD80\uACFC\uC561 \u2260 \uC794\uC5EC \uBD80\uACFC + \uC2B9\uC778 \uD658\uAE09'
      WHEN 'status_matches_amounts' THEN E'\uC0C1\uD0DC\uC640 \uAE08\uC561 \uBD88\uC77C\uCE58'
      ELSE E'\uCDE8\uC18C\u00B7\uD658\uBD88 \uC8FC\uBB38 \uC218\uC218\uB8CC \uAC80\uD1A0 \uB204\uB77D'
    END;
    FOR r IN
      SELECT ob.id, ob.store_id, o.order_no, st.store_name
        FROM jsonb_array_elements_text(coalesce(v_report -> v_check -> 'new_ids', '[]'::jsonb)) AS x(id)
        JOIN public.store_sale_fee_obligations ob ON ob.id = x.id::uuid
        JOIN public.store_orders o ON o.id = ob.order_id
        JOIN public.stores st ON st.id = ob.store_id
    LOOP
      IF public.store_commission_notify_admin(
           'settlement_exception:' || v_check || ':' || r.id::text,
           'settlement_financial_exception', 'critical',
           E'[\uAE08\uC735 \uC608\uC678] ' || coalesce(r.store_name, '') || E' \u00B7 #' || coalesce(r.order_no, ''),
           v_label || E' \u00B7 \uADFC\uAC70 \uD655\uC778 \uC804 \uC784\uC758 \uC815\uC815 \uAE08\uC9C0',
           '/admin/store-settlements?tab=ledger&order_no=' || coalesce(r.order_no, '') || '&open=' || r.id::text,
           'store_sale_fee_obligations', r.id::text) THEN
        v_integrity := v_integrity + 1;
      END IF;
    END LOOP;
  END LOOP;

  -- 4) Payout suspects: Coin above platform-held money (duplicate payout) / legacy manual payouts.
  FOR r IN
    SELECT x->>'order_id' AS order_id, x->>'order_no' AS order_no, x->>'store_id' AS store_id, x->>'store_name' AS store_name,
           (x->>'coin_over_credit')::bigint AS over, x->>'class' AS cls, (x->>'legacy_net_php')::bigint AS legacy_php
      FROM jsonb_array_elements(public.store_platform_payable_page(NULL, NULL, NULL, 'exceptions', 500, 0) -> 'rows') AS x
     -- R-D5: orders created before the cutoff are preserved as-is (reported, not alerted).
     WHERE NOT EXISTS (
       SELECT 1 FROM public.store_orders o
        WHERE o.id::text = x->>'order_id' AND o.created_at < public.store_commission_d5_legacy_cutoff()
     )
  LOOP
    IF r.over > 0 THEN
      IF public.store_commission_notify_admin(
           'settlement_exception:coin_over_credit:' || r.order_id,
           'settlement_financial_exception', 'critical',
           E'[\uC911\uBCF5 \uC9C0\uAE09 \uC758\uC2EC] ' || coalesce(r.store_name, '') || E' \u00B7 #' || coalesce(r.order_no, ''),
           E'\uD50C\uB7AB\uD3FC \uBCF4\uC720\uBD84(\uC0C1\uD488\uAD8C \uB808\uC77C \uC81C\uC678)\uBCF4\uB2E4 \uCF54\uC778 ' || r.over::text || E' \uCD08\uACFC \uC9C0\uAE09 \u00B7 \uADFC\uAC70 \uD655\uC778 \uC804 \uD68C\uC218 \uAE08\uC9C0',
           '/admin/store-settlements?tab=exceptions&store_id=' || r.store_id,
           'store_orders', r.order_id) THEN
        v_payout := v_payout + 1;
      END IF;
    END IF;
    IF r.cls = 'legacy_manual_paid' THEN
      IF public.store_commission_notify_admin(
           'settlement_exception:legacy_manual_paid:' || r.order_id,
           'settlement_financial_exception', 'warning',
           E'[\uACFC\uAC70 \uC218\uB3D9 \uC9C0\uAE09 \uD655\uC778] ' || coalesce(r.store_name, '') || E' \u00B7 #' || coalesce(r.order_no, ''),
           E'\uC9C1\uC811 \uACB0\uC81C \uC8FC\uBB38\uC5D0 \uC218\uB3D9 \uC9C0\uAE09 \uAE30\uB85D \u20B1' || r.legacy_php::text || E' \u00B7 \uC774\uC911 \uC9C0\uAE09 \uC5EC\uBD80 \uD655\uC778 \uD544\uC694',
           '/admin/store-settlements?tab=exceptions&store_id=' || r.store_id,
           'store_orders', r.order_id) THEN
        v_payout := v_payout + 1;
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'review_replayed', v_review, 'balance_mismatch', v_mismatch,
                            'integrity', v_integrity, 'payout_suspects', v_payout);
END;
$function$;
