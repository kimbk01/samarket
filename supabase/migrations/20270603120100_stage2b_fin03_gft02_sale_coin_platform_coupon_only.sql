-- Stage 2-B FIN-03 (option A) + GFT-02: sale Coin = platform-funded coupon ONLY.
-- Gift certificate money is owed on the gift rail (20270603120000), so it is no longer minted as Coin.
--
-- Production base (read-only snapshot 2026-10-21, project ckdosyydvgzqwpbwuhon):
--   public.credit_coin_from_confirmed_sale(uuid, uuid, uuid, integer, text)  md5(prosrc) = 49773271f36eda0227f9a3e2231fbc5b
--   public.store_platform_payable_page(uuid[], timestamptz, timestamptz, text, integer, integer)
--                                                                            md5(prosrc) = 47b54ef1d02ff73bf472726208f4aabb
--
-- credit_coin_from_confirmed_sale (minimal diff): after the existing idempotency re-check, a mint above the
--   order's platform_funded_amount (or for an order of another store) raises coin_mint_exceeds_platform_held.
--   Existing sale_coin:{order} rows still return idempotent (no re-mint, no clawback - D-5).
-- store_platform_payable_page: Coin rail owes only platform_funded_amount (coin_due_php); gift merchant net is
--   "gift rail payable (net, paid via gift payout)". Identity per completed order:
--     direct_php + gift_rail_net_php + coin_due_php = store sale after gift fee
--     platform_owes_php = gift_rail_net_php + coin_due_php        (H section 2: 270 + 40 = 310)
--   coin_over_credit keeps the pre-stage-2 rule for sale_coin rows minted before the cutoff
--   2026-10-20 20:30 UTC (legacy_preserved, D-5: no new alert for preserved history).
--   Existing output keys are kept (store_commission_enqueue_exception_notifications reads them).
-- Data: none changed.
--
-- Rollback (manual, Owner approval): re-create both functions from the prod base bodies (md5 above).

CREATE OR REPLACE FUNCTION public.credit_coin_from_confirmed_sale(p_store_id uuid, p_order_id uuid, p_settlement_id uuid, p_amount integer, p_idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  v_expected text;
  v_ledger uuid;
  v_bal integer;
  v_settlement_status text;
  v_cap integer;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_store_id IS NULL OR p_order_id IS NULL OR p_amount IS NULL OR p_amount <= 0 OR v_key IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_input');
  END IF;

  v_expected := 'sale_coin:' || p_order_id::text;
  IF v_key IS DISTINCT FROM v_expected THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_idempotency_key', 'expected', v_expected);
  END IF;

  SELECT id INTO v_ledger
    FROM public.store_economic_point_ledger
   WHERE idempotency_key = v_key;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true, 'ledger_id', v_ledger);
  END IF;

  -- SSOT-19 F-08: order-level lock on the (unique) settlement row; a paid
  -- settlement payout excludes a Coin mint for the same sale.
  SELECT settlement_status INTO v_settlement_status
    FROM public.store_settlements
   WHERE order_id = p_order_id
   FOR UPDATE;
  IF FOUND AND v_settlement_status = 'paid' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'settlement_already_paid');
  END IF;
  -- Re-check after waiting for the settlement lock (concurrent mint).
  SELECT id INTO v_ledger
    FROM public.store_economic_point_ledger
   WHERE idempotency_key = v_key;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true, 'ledger_id', v_ledger);
  END IF;

  -- Stage 2-B FIN-03 option A / GFT-02: sale Coin = platform-funded coupon of THIS store's order only.
  -- Gift certificate money is paid on the gift rail, buyer payment_amount goes to the store directly.
  SELECT GREATEST(0, trunc(coalesce(o.platform_funded_amount, 0)))::integer INTO v_cap
    FROM public.store_orders o
   WHERE o.id = p_order_id
     AND o.store_id = p_store_id;
  IF p_amount > coalesce(v_cap, 0) THEN
    RAISE EXCEPTION 'coin_mint_exceeds_platform_held: order % amount % cap %',
      p_order_id, p_amount, coalesce(v_cap, 0);
  END IF;

  PERFORM public.ensure_store_economic_point_account(p_store_id);

  UPDATE public.store_economic_point_accounts
     SET balance = balance + p_amount, updated_at = now()
   WHERE store_id = p_store_id
   RETURNING balance INTO v_bal;

  INSERT INTO public.store_economic_point_ledger (
    store_id, entry_kind, amount, balance_after, related_type, related_id,
    idempotency_key, actor_type, meta
  ) VALUES (
    p_store_id, 'SALE_EARN', p_amount, v_bal,
    'store_order', p_order_id::text,
    v_key, 'system',
    jsonb_build_object(
      'order_id', p_order_id,
      'settlement_id', p_settlement_id,
      'mint_identity', 'sale_coin'
    )
  ) RETURNING id INTO v_ledger;

  RETURN jsonb_build_object(
    'ok', true, 'idempotent', false, 'ledger_id', v_ledger, 'balance_after', v_bal
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.store_platform_payable_page(p_store_ids uuid[], p_from timestamp with time zone, p_to timestamp with time zone, p_view text, p_limit integer, p_offset integer)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH base AS (
    SELECT o.id AS order_id, o.order_no, o.store_id, s.store_name, o.created_at, o.buyer_payment_method,
           GREATEST(0, trunc(coalesce(o.payment_amount, 0)))::bigint AS direct_php,
           (GREATEST(0, trunc(coalesce(o.gift_redemption_amount, 0)))
            + GREATEST(0, trunc(coalesce(o.platform_funded_amount, 0))))::bigint AS held_php,
           -- Stage 2-B (D-2 option A): only the platform-funded coupon is paid as Coin.
           GREATEST(0, trunc(coalesce(o.platform_funded_amount, 0)))::bigint AS coin_due_php,
           coalesce((SELECT e.amount FROM public.store_economic_point_ledger e
                      WHERE e.idempotency_key = 'sale_coin:' || o.id::text), 0)::bigint AS coin_minted,
           -- sale_coin minted before the stage-2 cutoff (gift gross was minted then) - preserved as is (D-5).
           coalesce((SELECT e.created_at < '2026-10-20 20:30:00+00'::timestamptz FROM public.store_economic_point_ledger e
                      WHERE e.idempotency_key = 'sale_coin:' || o.id::text), false) AS legacy_preserved,
           -- Gift redemptions with a live gift_certificate_redemptions row are owed on the gift
           -- revenue rail (gift_certificate_revenue_ledger -> admin gift payout), never as Coin.
           LEAST(GREATEST(0, trunc(coalesce(o.gift_redemption_amount, 0)))::bigint,
                 coalesce((SELECT sum(r.redeemed_amount) FROM public.gift_certificate_redemptions r
                            WHERE r.order_id = o.id AND NOT coalesce(r.reversed, false)), 0)::bigint) AS gift_rail_php,
           coalesce((SELECT sum(r.merchant_net_amount) FROM public.gift_certificate_redemptions r
                      WHERE r.order_id = o.id AND NOT coalesce(r.reversed, false)), 0)::bigint AS gift_rail_net_php,
           coalesce((SELECT sum(r.platform_fee_amount) FROM public.gift_certificate_redemptions r
                      WHERE r.order_id = o.id AND NOT coalesce(r.reversed, false)), 0)::bigint AS gift_fee_php,
           st.settlement_status, coalesce(st.net_settlement_amount, st.settlement_amount, 0)::bigint AS legacy_net_php
      FROM public.store_orders o
      JOIN public.stores s ON s.id = o.store_id
      LEFT JOIN public.store_settlements st ON st.order_id = o.id
     WHERE o.order_status = 'completed'
       AND (p_store_ids IS NULL OR o.store_id = ANY (p_store_ids))
       AND (p_from IS NULL OR o.created_at >= p_from)
       AND (p_to IS NULL OR o.created_at < p_to)
  ),
  resid AS (
    SELECT *, held_php - gift_rail_php AS rail_free_held_php FROM base
  ),
  cls AS (
    SELECT *,
           LEAST(coin_due_php, coin_minted) AS held_paid_by_coin_php,
           coin_due_php - LEAST(coin_due_php, coin_minted) AS payable_php,
           gift_rail_net_php + coin_due_php AS platform_owes_php,
           -- Coin above what the Coin rail owes (platform coupon). Legacy mints keep the pre-stage-2 rule.
           CASE WHEN legacy_preserved THEN GREATEST(0, coin_minted - rail_free_held_php)
                ELSE GREATEST(0, coin_minted - coin_due_php)
           END AS coin_over_credit,
           CASE
             WHEN coin_due_php - LEAST(coin_due_php, coin_minted) > 0 THEN 'payable'
             WHEN gift_rail_php > 0 THEN 'gift_rail'
             WHEN settlement_status = 'paid' THEN 'legacy_manual_paid'
             ELSE 'direct_collected'
           END AS class
      FROM resid
  ),
  filtered AS (
    -- payable: what the Coin rail owes (+ legacy manual payouts to review); exceptions: financial
    -- anomalies (Coin above the Coin rail, legacy manual payouts); all: every completed order.
    SELECT * FROM cls
     WHERE CASE coalesce(p_view, 'payable')
             WHEN 'all' THEN true
             WHEN 'exceptions' THEN coin_over_credit > 0 OR class = 'legacy_manual_paid'
             ELSE class IN ('payable', 'legacy_manual_paid')
           END
  )
  SELECT jsonb_build_object(
    'summary', (SELECT jsonb_build_object(
        'orders', count(*),
        'direct_collected_php', coalesce(sum(direct_php), 0),
        'platform_held_php', coalesce(sum(held_php), 0),
        'held_paid_by_coin_php', coalesce(sum(held_paid_by_coin_php), 0),
        'coin_due_php', coalesce(sum(coin_due_php), 0),
        'gift_rail_php', coalesce(sum(gift_rail_php), 0),
        'gift_rail_net_php', coalesce(sum(gift_rail_net_php), 0),
        'gift_fee_php', coalesce(sum(gift_fee_php), 0),
        'gift_rail_orders', count(*) FILTER (WHERE gift_rail_php > 0),
        'platform_owes_php', coalesce(sum(platform_owes_php), 0),
        'payable_php', coalesce(sum(payable_php), 0),
        'payable_orders', count(*) FILTER (WHERE payable_php > 0),
        'coin_over_credit', coalesce(sum(coin_over_credit), 0),
        'legacy_preserved_orders', count(*) FILTER (WHERE legacy_preserved),
        'legacy_open_settlement_php', coalesce(sum(legacy_net_php) FILTER (WHERE settlement_status IN ('scheduled', 'processing', 'held')), 0),
        'legacy_open_settlement_count', count(*) FILTER (WHERE settlement_status IN ('scheduled', 'processing', 'held')),
        'legacy_manual_paid_php', coalesce(sum(legacy_net_php) FILTER (WHERE settlement_status = 'paid'), 0),
        'legacy_manual_paid_count', count(*) FILTER (WHERE settlement_status = 'paid')
      ) FROM cls),
    -- Gift rail position now (not date-filtered): available to pay out and already paid out.
    'gift_rail', jsonb_build_object(
        'available_php', coalesce((SELECT sum(public.gift_certificate_store_revenue_available(x.store_id))
                                     FROM (SELECT DISTINCT l.store_id FROM public.gift_certificate_revenue_ledger l
                                            WHERE p_store_ids IS NULL OR l.store_id = ANY (p_store_ids)) x), 0),
        'paid_out_php', coalesce((SELECT sum(p.amount) FROM public.gift_certificate_store_payouts p
                                   WHERE p_store_ids IS NULL OR p.store_id = ANY (p_store_ids)), 0)
      ),
    'total', (SELECT count(*) FROM filtered),
    'rows', coalesce((
      SELECT jsonb_agg(r ORDER BY r.created_at DESC, r.order_id) FROM (
        SELECT order_id, order_no, store_id, store_name, created_at, buyer_payment_method, direct_php, held_php,
               coin_minted, coin_due_php, gift_rail_php, gift_rail_net_php, gift_fee_php, platform_owes_php,
               held_paid_by_coin_php, payable_php, coin_over_credit, legacy_preserved,
               settlement_status, legacy_net_php, class
          FROM filtered
         ORDER BY created_at DESC, order_id
         LIMIT LEAST(500, GREATEST(1, coalesce(p_limit, 100)))
        OFFSET GREATEST(0, coalesce(p_offset, 0))
      ) r
    ), '[]'::jsonb)
  );
$function$;
