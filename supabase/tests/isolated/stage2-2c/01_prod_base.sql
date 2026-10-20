-- Production base definitions for the stage 2-C isolated test (copied verbatim from the latest repo migration of
-- each function; 02_base_md5.test.sql asserts md5(prosrc) equals production, read-only 2026-10-21).
-- from 20261128200000_gift_certificate_instance_validity.sql
CREATE OR REPLACE FUNCTION public.gift_certificate_issue_date(p_at timestamptz DEFAULT now())
RETURNS date
LANGUAGE sql
STABLE
AS $$
  SELECT (coalesce(p_at, now()) AT TIME ZONE 'Asia/Manila')::date;
$$;

-- from 20261128200000_gift_certificate_instance_validity.sql
CREATE OR REPLACE FUNCTION public.gift_certificate_instance_is_expired(p_valid_until date)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT p_valid_until IS NOT NULL
     AND p_valid_until < public.gift_certificate_issue_date(now());
$$;

-- from 20261201300000_delivery_ads_canonical_finance_ast004_ast005.sql
CREATE OR REPLACE FUNCTION public.ensure_store_economic_point_account(p_store_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.store_economic_point_accounts (store_id, balance)
  VALUES (p_store_id, 0)
  ON CONFLICT (store_id) DO NOTHING;
END;
$$;

-- from 20261202100000_currency_cut_b_coin_reversal.sql
CREATE OR REPLACE FUNCTION public.reverse_coin_credits_for_order(
  p_order_id uuid,
  p_idempotency_key text,
  p_reason text DEFAULT 'order_refund'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  v_order public.store_orders%ROWTYPE;
  v_store_id uuid;
  v_credited integer := 0;
  v_already_reversed integer := 0;
  v_to_reverse integer := 0;
  v_bal_before integer := 0;
  v_bal_after integer := 0;
  v_reversal_id uuid;
  v_existing uuid;
  v_original_ids uuid[] := ARRAY[]::uuid[];
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_order_id IS NULL OR v_key IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_input');
  END IF;

  SELECT id INTO v_existing
    FROM public.store_economic_point_ledger
   WHERE idempotency_key = v_key;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'reversal_ledger_id', v_existing,
      'order_id', p_order_id
    );
  END IF;

  SELECT * INTO v_order
    FROM public.store_orders
   WHERE id = p_order_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'order_not_found');
  END IF;
  v_store_id := v_order.store_id;

  SELECT COALESCE(SUM(l.amount), 0)::integer,
         COALESCE(array_agg(l.id ORDER BY l.created_at), ARRAY[]::uuid[])
    INTO v_credited, v_original_ids
    FROM public.store_economic_point_ledger l
    LEFT JOIN public.store_settlements s
      ON l.related_type = 'store_settlement'
     AND l.related_id = s.id::text
    LEFT JOIN public.gift_certificate_redemptions r
      ON l.related_type = 'gift_redemption'
     AND l.related_id = r.id::text
   WHERE l.store_id = v_store_id
     AND l.entry_kind IN ('SALE_EARN', 'GIFT_REDEMPTION_EARN')
     AND l.amount > 0
     AND (
       coalesce(l.meta->>'order_id', '') = p_order_id::text
       OR s.order_id = p_order_id
       OR r.order_id = p_order_id
     );

  SELECT COALESCE(SUM(ABS(l.amount)), 0)::integer
    INTO v_already_reversed
    FROM public.store_economic_point_ledger l
   WHERE l.store_id = v_store_id
     AND l.entry_kind = 'REVERSAL'
     AND coalesce(l.meta->>'order_id', '') = p_order_id::text;

  v_to_reverse := GREATEST(0, v_credited - v_already_reversed);

  IF v_to_reverse <= 0 THEN
    RETURN jsonb_build_object(
      'ok', true,
      'skipped', true,
      'reversed_amount', 0,
      'order_id', p_order_id,
      'credited_amount', v_credited,
      'already_reversed', v_already_reversed
    );
  END IF;

  PERFORM public.ensure_store_economic_point_account(v_store_id);

  SELECT balance INTO v_bal_before
    FROM public.store_economic_point_accounts
   WHERE store_id = v_store_id
   FOR UPDATE;

  v_bal_after := coalesce(v_bal_before, 0) - v_to_reverse;

  UPDATE public.store_economic_point_accounts
     SET balance = v_bal_after,
         updated_at = now()
   WHERE store_id = v_store_id;

  INSERT INTO public.store_economic_point_ledger (
    store_id, entry_kind, amount, balance_after, related_type, related_id,
    idempotency_key, actor_type, meta
  ) VALUES (
    v_store_id, 'REVERSAL', -v_to_reverse, v_bal_after,
    'store_order', p_order_id::text,
    v_key, 'system',
    jsonb_build_object(
      'order_id', p_order_id,
      'reason', coalesce(v_reason, 'order_refund'),
      'reversed_amount', v_to_reverse,
      'original_ledger_ids', to_jsonb(v_original_ids),
      'balance_before', coalesce(v_bal_before, 0),
      'balance_after', v_bal_after
    )
  ) RETURNING id INTO v_reversal_id;

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'reversal_ledger_id', v_reversal_id,
    'reversed_amount', v_to_reverse,
    'order_id', p_order_id,
    'original_ledger_ids', to_jsonb(v_original_ids),
    'balance_before', coalesce(v_bal_before, 0),
    'balance_after', v_bal_after
  );
END;
$$;

-- from 20270421120300_finance_ssot19_d2_gift.sql
CREATE OR REPLACE FUNCTION public.gift_certificate_redemption_reverse(
  p_order_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_red public.gift_certificate_redemptions%ROWTYPE;
  v_inst public.gift_certificate_instances%ROWTYPE;
  v_avail_before integer;
  v_shortfall integer;
  v_cash_balance integer;
  v_debit integer;
  v_new_cash integer;
  v_restored integer;
  v_new_status text;
  v_count integer := 0;
  v_obligation_id uuid;
  v_has_coin_credit boolean;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_order_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_args');
  END IF;

  FOR v_red IN
    SELECT * FROM public.gift_certificate_redemptions
     WHERE order_id = p_order_id
       AND reversed = false
     ORDER BY created_at
     FOR UPDATE
  LOOP
    v_count := v_count + 1;

    SELECT * INTO v_inst
      FROM public.gift_certificate_instances
     WHERE id = v_red.instance_id
     FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'gift_reverse_instance_not_found redemption=%', v_red.id;
    END IF;

    -- Restore redeemed + forfeited face (one-time extinguish reversed on cancel).
    v_restored := least(
      v_inst.face_value,
      v_inst.remaining_balance
        + v_red.redeemed_amount
        + coalesce(v_red.forfeited_amount, 0)
    );
    IF v_restored = v_inst.face_value THEN
      v_new_status := 'ACTIVE';
    ELSIF v_restored > 0 THEN
      -- Historical compat only (new redeem path never leaves PARTIALLY_REDEEMED).
      v_new_status := 'PARTIALLY_REDEEMED';
    ELSE
      v_new_status := 'FULLY_REDEEMED';
    END IF;

    UPDATE public.gift_certificate_instances
       SET remaining_balance = v_restored,
           status = CASE
             WHEN status = 'GIFT_LOCKED' THEN 'GIFT_LOCKED'
             ELSE v_new_status
           END,
           version = version + 1,
           fully_redeemed_at = CASE WHEN v_restored > 0 THEN NULL ELSE fully_redeemed_at END
     WHERE id = v_inst.id;

    UPDATE public.gift_certificate_redemptions
       SET reversed = true,
           reversed_at = now()
     WHERE id = v_red.id;

    INSERT INTO public.gift_certificate_ledger (
      instance_id, store_id, user_id, entry_type, amount,
      related_type, related_id, description, actor_type
    ) VALUES (
      v_red.instance_id, v_red.store_id, v_red.buyer_user_id, 'REDEEM_REVERSE', v_red.redeemed_amount,
      'gift_certificate_redemption_reverse', v_red.id::text, 'Redemption reversed', 'system'
    );

    IF coalesce(v_red.forfeited_amount, 0) > 0 THEN
      INSERT INTO public.gift_certificate_ledger (
        instance_id, store_id, user_id, entry_type, amount,
        related_type, related_id, description, actor_type
      ) VALUES (
        v_red.instance_id, v_red.store_id, v_red.buyer_user_id, 'FORFEIT_REVERSE',
        v_red.forfeited_amount,
        'gift_certificate_redemption_reverse', v_red.id::text,
        'Forfeiture reversed', 'system'
      );
    END IF;

    PERFORM public.gift_certificate_promo_reverse_for_redemption(v_red.id);

    IF EXISTS (
      SELECT 1 FROM public.gift_certificate_revenue_ledger rl
       WHERE rl.redemption_id = v_red.id
         AND rl.entry_type = 'REVENUE_AVAILABLE'
    ) THEN
      INSERT INTO public.gift_certificate_revenue_ledger (
        store_id, redemption_id, entry_type, amount, related_type, related_id
      ) VALUES (
        v_red.store_id, v_red.id, 'REVERSED', -v_red.merchant_net_amount,
        'redemption_reverse', v_red.id::text
      );

      SELECT EXISTS (
        SELECT 1
          FROM public.store_economic_point_ledger l
         WHERE l.store_id = v_red.store_id
           AND l.entry_kind = 'GIFT_REDEMPTION_EARN'
           AND l.related_type = 'gift_redemption'
           AND l.related_id = v_red.id::text
           AND l.amount > 0
      ) INTO v_has_coin_credit;

      -- SSOT-19 F-10: Coin clawback is order-level (reverse_coin_credits_for_order).
      -- Archived Store Cash tables are never written here.
    END IF;
  END LOOP;

  IF v_count = 0 THEN
    RETURN jsonb_build_object('ok', true, 'reversed_count', 0, 'idempotent', true);
  END IF;

  UPDATE public.store_orders so
     SET gift_redemption_amount = coalesce((
       SELECT SUM(r.redeemed_amount)::integer
         FROM public.gift_certificate_redemptions r
        WHERE r.order_id = p_order_id
          AND r.reversed = false
     ), 0)
   WHERE so.id = p_order_id;

  RETURN jsonb_build_object('ok', true, 'reversed_count', v_count, 'order_id', p_order_id);
END;
$$;

-- from 20270101130000_gift_certificate_cancel_order_restore.sql
CREATE OR REPLACE FUNCTION public.gift_certificate_cancel_order_restore(
  p_order_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.store_orders%ROWTYPE;
  v_reverse jsonb;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_order_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_args');
  END IF;

  SELECT * INTO v_order
    FROM public.store_orders
   WHERE id = p_order_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'order_not_found');
  END IF;

  -- Only restore gift for cancelled (or payment-failure mapped cancel) terminals.
  IF v_order.order_status IS DISTINCT FROM 'cancelled'
     AND coalesce(v_order.payment_status, '') IS DISTINCT FROM 'failed' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'order_not_cancelled',
      'order_status', v_order.order_status
    );
  END IF;

  v_reverse := public.gift_certificate_redemption_reverse(p_order_id);
  IF coalesce(v_reverse->>'ok', 'false') <> 'true' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', coalesce(v_reverse->>'error', 'gift_reverse_failed'),
      'gift_reverse', v_reverse
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'order_id', p_order_id,
    'idempotent', coalesce((v_reverse->>'idempotent')::boolean, false)
      OR coalesce((v_reverse->>'reversed_count')::int, 0) = 0,
    'gift_reverse', v_reverse
  );
END;
$$;

-- from 20270101150000_gift_refund_order_atomic_from_status_cas.sql
CREATE OR REPLACE FUNCTION public.gift_certificate_refund_order_atomic(
  p_order_id uuid,
  p_actor_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.store_orders%ROWTYPE;
  v_reverse jsonb;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_order_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_args');
  END IF;

  SELECT * INTO v_order
    FROM public.store_orders
   WHERE id = p_order_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'order_not_found');
  END IF;

  IF v_order.order_status = 'refunded' THEN
    v_reverse := public.gift_certificate_redemption_reverse(p_order_id);
    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'order_id', p_order_id,
      'gift_reverse', v_reverse
    );
  END IF;

  IF v_order.order_status IS DISTINCT FROM 'refund_requested' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'unexpected_from_status',
      'order_status', v_order.order_status
    );
  END IF;

  -- Gift reverse FIRST in same TX. Failure => RAISE => refund not terminal.
  v_reverse := public.gift_certificate_redemption_reverse(p_order_id);
  IF coalesce(v_reverse->>'ok', 'false') <> 'true' THEN
    RAISE EXCEPTION 'gift_reverse_failed: %', coalesce(v_reverse->>'error', 'unknown');
  END IF;

  UPDATE public.store_orders
     SET order_status = 'refunded',
         payment_status = 'refunded',
         refunded_at = coalesce(refunded_at, now()),
         refund_approved_at = coalesce(refund_approved_at, now()),
         updated_at = now()
   WHERE id = p_order_id
     AND order_status = 'refund_requested';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'gift_refund_status_race';
  END IF;

  UPDATE public.store_payments
     SET status = 'refunded'
   WHERE order_id = p_order_id
     AND status = 'succeeded';

  RETURN jsonb_build_object(
    'ok', true,
    'order_id', p_order_id,
    'gift_reverse', v_reverse
  );
END;
$$;

-- from 20260825120000_free_coupon_ssot_m1_m6.sql
CREATE OR REPLACE FUNCTION public.restore_store_coupon_entitlement(
  p_order_id uuid,
  p_allow_after_completed boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ent record;
  v_campaign record;
BEGIN
  SELECT e.*
    INTO v_ent
    FROM public.coupon_user_entitlements e
   WHERE e.redeemed_order_id = p_order_id
     AND e.status = 'redeemed'
   LIMIT 1
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'restored', false);
  END IF;

  SELECT restore_on_full_refund, first_order_scope
    INTO v_campaign
    FROM public.store_coupon_campaigns
   WHERE id = v_ent.campaign_id;

  IF p_allow_after_completed IS TRUE THEN
    IF v_campaign.first_order_scope IS NOT NULL THEN
      RETURN jsonb_build_object('ok', true, 'restored', false, 'reason', 'first_order_no_restore');
    END IF;
    IF v_campaign.restore_on_full_refund IS NOT TRUE THEN
      RETURN jsonb_build_object('ok', true, 'restored', false, 'reason', 'policy_no_restore');
    END IF;
  END IF;

  UPDATE public.coupon_user_entitlements
     SET status = 'available',
         redeemed_order_id = NULL,
         updated_at = now()
   WHERE id = v_ent.id;

  UPDATE public.store_coupon_campaigns
     SET reserved_spend_php = reserved_spend_php + v_ent.reserved_php,
         updated_at = now()
   WHERE id = v_ent.campaign_id;

  DELETE FROM public.store_coupon_redemptions
   WHERE order_id = p_order_id;

  RETURN jsonb_build_object('ok', true, 'restored', true);
END;
$$;

-- from 20270601140000_r7_admin_store_coupon_campaign_page.sql
CREATE OR REPLACE FUNCTION public.admin_store_coupon_campaign_page(
  p_status text,
  p_funding text,
  p_store_id uuid,
  p_campaign_id uuid,
  p_limit integer,
  p_offset integer
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH params AS (
    SELECT nullif(nullif(btrim(coalesce(p_status, '')), ''), 'all') AS status_q,
           nullif(nullif(btrim(coalesce(p_funding, '')), ''), 'all') AS funding_q,
           LEAST(100, GREATEST(1, coalesce(p_limit, 20))) AS lim,
           GREATEST(0, coalesce(p_offset, 0)) AS off
  ),
  classified AS (
    SELECT c.id, c.store_id, c.funding_mode, c.created_at,
           CASE
             WHEN btrim(coalesce(c.lifecycle_state, '')) IN ('requested', 'draft') THEN 'waiting'
             WHEN btrim(coalesce(c.lifecycle_state, '')) IN ('ended', 'revoked', 'rejected') THEN 'ended'
             ELSE 'active'
           END AS bucket
      FROM public.store_coupon_campaigns c
  ),
  filtered AS (
    SELECT k.*
      FROM classified k
     CROSS JOIN params pr
     WHERE (pr.status_q IS NULL OR k.bucket = pr.status_q)
       AND (pr.funding_q IS NULL OR k.funding_mode = pr.funding_q)
       AND (p_store_id IS NULL OR k.store_id = p_store_id)
       AND (p_campaign_id IS NULL OR k.id = p_campaign_id)
  ),
  page AS (
    SELECT f.id, f.created_at
      FROM filtered f
     ORDER BY f.created_at DESC, f.id DESC
     LIMIT (SELECT lim FROM params)
    OFFSET (SELECT off FROM params)
  ),
  ent AS (
    SELECT e.campaign_id,
           count(*) AS claimed,
           count(*) FILTER (WHERE e.status = 'redeemed') AS redeemed,
           count(*) FILTER (WHERE e.status = 'revoked') AS revoked,
           count(*) FILTER (
             WHERE e.status = 'expired'
                OR (e.status IN ('available', 'restored') AND e.expires_at <= now())
           ) AS expired,
           count(*) FILTER (
             WHERE e.status IN ('available', 'restored') AND e.expires_at > now()
           ) AS active_held
      FROM public.coupon_user_entitlements e
     WHERE e.campaign_id IN (SELECT id FROM page)
     GROUP BY e.campaign_id
  ),
  red AS (
    SELECT r.campaign_id,
           count(*) AS order_count,
           sum(GREATEST(0, round(coalesce(o.discount_amount, 0)::numeric))) AS customer_discount,
           sum(GREATEST(0, round(coalesce(o.store_funded_amount, 0)::numeric))) AS store_funded,
           sum(GREATEST(0, round(coalesce(o.platform_funded_amount, 0)::numeric))) AS platform_funded,
           sum(round(coalesce(o.payment_amount, 0)::numeric)) AS order_sales_php
      FROM public.store_coupon_redemptions r
      JOIN public.store_orders o ON o.id = r.order_id
     WHERE r.campaign_id IN (SELECT id FROM page)
     GROUP BY r.campaign_id
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM filtered),
    'limit', (SELECT lim FROM params),
    'offset', (SELECT off FROM params),
    'rows', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', pg.id,
               'claimed', coalesce(en.claimed, 0),
               'redeemed', coalesce(en.redeemed, 0),
               'active_held', coalesce(en.active_held, 0),
               'expired', coalesce(en.expired, 0),
               'revoked', coalesce(en.revoked, 0),
               'order_count', coalesce(rd.order_count, 0),
               'customer_discount', coalesce(rd.customer_discount, 0),
               'store_funded', coalesce(rd.store_funded, 0),
               'platform_funded', coalesce(rd.platform_funded, 0),
               'order_sales_php', coalesce(rd.order_sales_php, 0)
             ) ORDER BY pg.created_at DESC, pg.id DESC)
        FROM page pg
        LEFT JOIN ent en ON en.campaign_id = pg.id
        LEFT JOIN red rd ON rd.campaign_id = pg.id
    ), '[]'::jsonb),
    'kpi', (
      SELECT jsonb_build_object(
               'total', count(*),
               'active', count(*) FILTER (WHERE bucket = 'active'),
               'waiting', count(*) FILTER (WHERE bucket = 'waiting'),
               'ended', count(*) FILTER (WHERE bucket = 'ended'))
        FROM classified
    ),
    'stores', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', s.id, 'name', s.store_name) ORDER BY s.store_name, s.id)
        FROM public.stores s
       WHERE s.id IN (SELECT DISTINCT store_id FROM classified)
    ), '[]'::jsonb),
    'recent', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'created_at', x.created_at,
               'title', x.title,
               'actor_label', x.actor_label,
               'action', x.action
             ) ORDER BY x.created_at DESC, x.id DESC)
        FROM (
          SELECT a.id, a.created_at, a.action, c.title,
                 coalesce(nullif(btrim(p.display_name), ''), nullif(btrim(p.nickname), ''), nullif(btrim(p.username), '')) AS actor_label
            FROM public.coupon_audit_events a
            JOIN public.store_coupon_campaigns c ON c.id = a.campaign_id
            LEFT JOIN public.profiles p ON p.id = a.actor_user_id
           ORDER BY a.created_at DESC, a.id DESC
           LIMIT 8
        ) x
    ), '[]'::jsonb)
  );
$$;
