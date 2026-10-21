-- Stage 2-B GFT-02: integrity check "per-order sale_coin <= platform-funded coupon" (FIN-03 option A formula).
-- Past over-mints are NOT corrected, clawed back or re-minted (D-5): sale_coin rows created before the cutoff
-- 2026-10-20 20:30 UTC are reported as legacy_preserved and are not counted as violations.
--
-- Production base (read-only snapshot 2026-10-21, project ckdosyydvgzqwpbwuhon):
--   public.store_commission_integrity_report(uuid[])  md5(prosrc) = b7871c44f74347ddd6d9e26fb1115270
--   (prod 2026-10-21: 11 sale_coin rows, all minted <= 2026-09-15, all above the new formula -> 11 legacy_preserved, 0 violations)
-- Minimal diff: new CTE ic + new output key 'sale_coin_le_platform_coupon' {violations, ids, legacy_preserved, legacy_ids}.
-- Existing keys unchanged. store_commission_enqueue_exception_notifications iterates a fixed key list -> no new alerts.
--
-- Rollback (manual, Owner approval): re-create the function from the prod base body (md5 above).

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
              FROM public.business_cash_ledger l WHERE l.store_id = a.store_id) AS ledger_sum
      FROM public.business_cash_accounts a
     WHERE p_store_ids IS NULL OR a.store_id = ANY (p_store_ids)
  ),
  i6 AS (SELECT store_id FROM acct WHERE balance_minor <> ledger_sum),
  i7 AS (SELECT id FROM ob WHERE original_fee_due_minor IS NULL),
  ic AS (  -- GFT-02: sale Coin per order <= platform_funded_amount (option A); pre-cutoff rows = legacy_preserved
    SELECT e.related_id AS order_id,
           e.created_at < '2026-10-20 20:30:00+00'::timestamptz AS legacy
      FROM public.store_economic_point_ledger e
      LEFT JOIN public.store_orders o ON o.id::text = e.related_id
     WHERE e.idempotency_key LIKE 'sale_coin:%'
       AND (p_store_ids IS NULL OR e.store_id = ANY (p_store_ids))
       AND e.amount > GREATEST(0, trunc(coalesce(o.platform_funded_amount, 0)))
  )
  SELECT jsonb_build_object(
    'obligations', (SELECT count(*) FROM ob),
    'charged_eq_due_plus_adjustments', jsonb_build_object('violations', (SELECT count(*) FROM i1), 'ids', (SELECT coalesce(jsonb_agg(id), '[]') FROM (SELECT id FROM i1 LIMIT 50) x)),
    'cash_ledger_eq_fee_paid', jsonb_build_object('violations', (SELECT count(*) FROM i2), 'ids', (SELECT coalesce(jsonb_agg(id), '[]') FROM (SELECT id FROM i2 LIMIT 50) x)),
    'status_matches_amounts', jsonb_build_object('violations', (SELECT count(*) FROM i3), 'ids', (SELECT coalesce(jsonb_agg(id), '[]') FROM (SELECT id FROM i3 LIMIT 50) x)),
    'closed_orders_reviewed', jsonb_build_object('violations', (SELECT count(*) FROM i4), 'ids', (SELECT coalesce(jsonb_agg(id), '[]') FROM (SELECT id FROM i4 LIMIT 50) x)),
    'balance_eq_ledger_sum', jsonb_build_object('violations', (SELECT count(*) FROM i6), 'ids', (SELECT coalesce(jsonb_agg(store_id), '[]') FROM (SELECT store_id FROM i6 LIMIT 50) x)),
    'original_unknown', jsonb_build_object('count', (SELECT count(*) FROM i7), 'ids', (SELECT coalesce(jsonb_agg(id), '[]') FROM (SELECT id FROM i7 LIMIT 50) x)),
    'sale_coin_le_platform_coupon', jsonb_build_object(
      'violations', (SELECT count(*) FROM ic WHERE NOT legacy),
      'ids', (SELECT coalesce(jsonb_agg(order_id), '[]') FROM (SELECT order_id FROM ic WHERE NOT legacy LIMIT 50) x),
      'legacy_preserved', (SELECT count(*) FROM ic WHERE legacy),
      'legacy_ids', (SELECT coalesce(jsonb_agg(order_id), '[]') FROM (SELECT order_id FROM ic WHERE legacy LIMIT 50) x))
  );
$function$;
