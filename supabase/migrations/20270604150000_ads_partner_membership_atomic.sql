-- Stage 3 / 3-D part 2 - ADS-03, ADS-04, ADS-05 (design G-2 section 3-D, RC-7).
-- Partner membership money steps move into single SQL transactions (no TS compensating delete,
-- no "refund commit -> status update" two-step).
--
-- New objects only (no existing function body is redefined):
--   * column  delivery_ad_partner_memberships.apply_idempotency_key (nullable) + unique index (store_id, key)
--   * index   delivery_ad_partner_memberships_open_store_uidx  - one open membership per store, only for
--             rows created at/after c_apply_from (D-5: the existing expired ACTIVE row created 2026-09-05
--             stays untouched and does not block a re-apply; read-time derivation treats it as ended).
--   * fn      owner_apply_partner_membership(store, owner, request_id)       - row + Cash debit in one TX
--   * fn      admin_partner_membership_decide(admin, id, action, reason, days) - approve / reject(+refund) in one TX
--   * fn      delivery_ad_partner_membership_expire_due(limit)                 - ACTIVE/CANCEL_PENDING past period
--             -> ENDED, only when period_end >= c_apply_from (past rows untouched, D-5)
-- Reused unchanged (prod md5(prosrc) checked by the isolated test):
--   business_cash_delivery_ad_spend   a06219b984fe0bc444abd09f03042614
--   business_cash_delivery_ad_refund  9d80e9acf5d29d3abb312c3d4860d84d
--
-- c_apply_from = '2026-10-21 00:00:00+00' (prod read 2026-10-21 05:43 UTC: max(created_at) of memberships
-- = 2026-09-05 03:37 UTC, duplicate open rows per store = 0, orphan partner fundings = 0).
--
-- Rollback (no data is rewritten by this migration):
--   DROP FUNCTION public.owner_apply_partner_membership(uuid, uuid, text);
--   DROP FUNCTION public.admin_partner_membership_decide(uuid, uuid, text, text, integer);
--   DROP FUNCTION public.delivery_ad_partner_membership_expire_due(integer);
--   DROP FUNCTION public.delivery_ad_partner_membership_expire_due_internal(uuid, integer);
--   DROP INDEX public.delivery_ad_partner_memberships_open_store_uidx;
--   DROP INDEX public.delivery_ad_partner_memberships_apply_key_uidx;
--   ALTER TABLE public.delivery_ad_partner_memberships DROP COLUMN apply_idempotency_key;
--   and redeploy the previous web build (TS writer).

ALTER TABLE public.delivery_ad_partner_memberships
  ADD COLUMN IF NOT EXISTS apply_idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS delivery_ad_partner_memberships_apply_key_uidx
  ON public.delivery_ad_partner_memberships (store_id, apply_idempotency_key)
  WHERE apply_idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS delivery_ad_partner_memberships_open_store_uidx
  ON public.delivery_ad_partner_memberships (store_id)
  WHERE status IN ('PENDING_REVIEW', 'ACTIVE', 'CANCEL_PENDING', 'PAST_DUE')
    AND created_at >= '2026-10-21 00:00:00+00'::timestamptz;

-- ---------------------------------------------------------------------------------------------
-- Expiry: ACTIVE / CANCEL_PENDING whose period ended -> ENDED (system audit row).
-- Only rows whose period_end >= c_apply_from (D-5). Optional store filter for the apply path.
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delivery_ad_partner_membership_expire_due_internal(
  p_store_id uuid,
  p_limit integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  c_apply_from constant timestamptz := '2026-10-21 00:00:00+00';
  c_system_actor constant uuid := '00000000-0000-0000-0000-000000000000';
  v_row record;
  v_n integer := 0;
BEGIN
  FOR v_row IN
    SELECT id, status, period_end
    FROM public.delivery_ad_partner_memberships
    WHERE status IN ('ACTIVE', 'CANCEL_PENDING')
      AND period_end IS NOT NULL
      AND period_end <= now()
      AND period_end >= c_apply_from
      AND (p_store_id IS NULL OR store_id = p_store_id)
    ORDER BY period_end
    LIMIT greatest(1, least(coalesce(p_limit, 200), 1000))
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.delivery_ad_partner_memberships
    SET status = 'ENDED', updated_at = now()
    WHERE id = v_row.id AND status = v_row.status;
    IF FOUND THEN
      v_n := v_n + 1;
      INSERT INTO public.delivery_ad_commercial_override_audit (
        entity_type, entity_id, actor_user_id, reason, before_json, after_json
      ) VALUES (
        'partner_membership', v_row.id::text, c_system_actor, 'system_partner_period_expired',
        jsonb_build_object('status', v_row.status, 'period_end', v_row.period_end),
        jsonb_build_object('status', 'ENDED')
      );
    END IF;
  END LOOP;
  RETURN v_n;
END;
$function$;

CREATE OR REPLACE FUNCTION public.delivery_ad_partner_membership_expire_due(p_limit integer DEFAULT 200)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN jsonb_build_object(
    'ok', true,
    'ended', public.delivery_ad_partner_membership_expire_due_internal(NULL, p_limit)
  );
END;
$function$;

-- ---------------------------------------------------------------------------------------------
-- ADS-04: owner apply = membership row + Cash debit in ONE transaction, idempotent per request id.
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.owner_apply_partner_membership(
  p_store_id uuid,
  p_owner_user_id uuid,
  p_request_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_key text := nullif(btrim(coalesce(p_request_id, '')), '');
  v_store record;
  v_cfg public.delivery_ad_partner_config;
  v_existing public.delivery_ad_partner_memberships;
  v_fund public.delivery_ad_canonical_bc_fundings;
  v_row public.delivery_ad_partner_memberships;
  v_id uuid := gen_random_uuid();
  v_spend jsonb;
BEGIN
  IF p_store_id IS NULL OR p_owner_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_store');
  END IF;
  IF v_key IS NULL OR length(v_key) > 200 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'idempotency_key_required');
  END IF;

  -- Serialise every apply of this store (spend locks the same row again inside this TX).
  SELECT id, owner_user_id INTO v_store FROM public.stores WHERE id = p_store_id FOR UPDATE;
  IF NOT FOUND OR v_store.owner_user_id IS DISTINCT FROM p_owner_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  -- Replay of the same request: return the row created by the first call.
  SELECT * INTO v_existing
  FROM public.delivery_ad_partner_memberships
  WHERE store_id = p_store_id AND apply_idempotency_key = v_key;
  IF FOUND THEN
    SELECT * INTO v_fund FROM public.delivery_ad_canonical_bc_fundings
    WHERE product_kind = 'partner' AND application_id = v_existing.id;
    RETURN jsonb_build_object(
      'ok', true, 'idempotent', true,
      'membership', to_jsonb(v_existing),
      'funding_id', v_fund.id,
      'amount_minor', coalesce(v_fund.amount_minor, v_existing.fee_snapshot_minor)
    );
  END IF;

  SELECT * INTO v_cfg FROM public.delivery_ad_partner_config WHERE id = 'default';
  IF NOT FOUND OR v_cfg.enabled IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'error', 'config_disabled');
  END IF;
  IF v_cfg.accepting_new_members IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_accepting');
  END IF;
  IF v_cfg.monthly_fee_minor IS NULL OR v_cfg.monthly_fee_minor <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'fee_not_configured');
  END IF;

  -- ADS-05: memberships created after the apply instant whose period ended are closed first.
  PERFORM public.delivery_ad_partner_membership_expire_due_internal(p_store_id, 50);

  -- Open = pending / past due, or ACTIVE / CANCEL_PENDING still inside its period (read-time
  -- derivation; an expired legacy ACTIVE row does not block, and is not modified).
  SELECT * INTO v_existing
  FROM public.delivery_ad_partner_memberships
  WHERE store_id = p_store_id
    AND (
      status IN ('PENDING_REVIEW', 'PAST_DUE')
      OR (status IN ('ACTIVE', 'CANCEL_PENDING') AND (period_end IS NULL OR period_end > now()))
    )
  ORDER BY created_at DESC
  LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_open', 'membership_id', v_existing.id);
  END IF;

  v_spend := public.business_cash_delivery_ad_spend(
    p_owner_user_id, p_store_id, v_id, 'partner', v_cfg.monthly_fee_minor
  );
  IF coalesce((v_spend ->> 'ok')::boolean, false) IS NOT TRUE THEN
    -- Nothing was debited; no membership row is written.
    RETURN v_spend || jsonb_build_object('ok', false, 'stage', 'debit');
  END IF;

  INSERT INTO public.delivery_ad_partner_memberships (
    id, store_id, status, period_start, period_end, fee_snapshot_minor, currency,
    benefit_snapshot, advertising_discount_percent_snapshot, config_version_snapshot,
    cancel_requested_at, apply_idempotency_key, created_at, updated_at
  ) VALUES (
    v_id, p_store_id, 'PENDING_REVIEW', NULL, NULL, v_cfg.monthly_fee_minor, v_cfg.currency,
    '{}'::jsonb, 0, v_cfg.version,
    NULL, v_key, now(), now()
  )
  RETURNING * INTO v_row;

  INSERT INTO public.delivery_ad_commercial_override_audit (
    entity_type, entity_id, actor_user_id, reason, before_json, after_json
  ) VALUES (
    'partner_membership', v_row.id::text, p_owner_user_id, 'owner_partner_apply', '{}'::jsonb,
    jsonb_build_object(
      'status', v_row.status, 'store_id', v_row.store_id,
      'payment', 'BUSINESS_CASH_SECURED',
      'amount_minor', v_spend -> 'amount_minor',
      'funding_id', v_spend -> 'funding_id'
    )
  );

  RETURN jsonb_build_object(
    'ok', true, 'idempotent', false,
    'membership', to_jsonb(v_row),
    'funding_id', v_spend -> 'funding_id',
    'amount_minor', v_spend -> 'amount_minor',
    'balance_after_minor', v_spend -> 'balance_after_minor'
  );
END;
$function$;

-- ---------------------------------------------------------------------------------------------
-- ADS-03: admin approve / reject in ONE transaction. Membership row lock first, then funding.
-- Reject = refund (existing function, same TX) + REJECTED. Approve = funding SECURED re-check + ACTIVE.
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_partner_membership_decide(
  p_admin_user_id uuid,
  p_membership_id uuid,
  p_action text,
  p_reason text,
  p_period_days integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.delivery_ad_partner_memberships;
  v_after public.delivery_ad_partner_memberships;
  v_fund public.delivery_ad_canonical_bc_fundings;
  v_cfg public.delivery_ad_partner_config;
  v_days integer;
  v_refund jsonb;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
BEGIN
  IF p_admin_user_id IS NULL OR NOT public.is_platform_admin(p_admin_user_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_action NOT IN ('approve', 'reject') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_action');
  END IF;

  SELECT * INTO v_row FROM public.delivery_ad_partner_memberships
  WHERE id = p_membership_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;
  IF v_row.status IS DISTINCT FROM 'PENDING_REVIEW' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'illegal_transition', 'status', v_row.status);
  END IF;

  IF p_action = 'approve' THEN
    SELECT * INTO v_fund FROM public.delivery_ad_canonical_bc_fundings
    WHERE product_kind = 'partner' AND application_id = v_row.id
    FOR UPDATE;
    IF NOT FOUND OR v_fund.status IS DISTINCT FROM 'SECURED' OR v_fund.store_id IS DISTINCT FROM v_row.store_id THEN
      RETURN jsonb_build_object('ok', false, 'error', 'funding_required');
    END IF;
    SELECT * INTO v_cfg FROM public.delivery_ad_partner_config WHERE id = 'default';
    IF NOT FOUND OR v_cfg.enabled IS NOT TRUE THEN
      RETURN jsonb_build_object('ok', false, 'error', 'config_disabled');
    END IF;
    IF v_cfg.monthly_fee_minor IS NULL OR v_cfg.monthly_fee_minor < 0 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'fee_not_configured');
    END IF;
    v_days := CASE WHEN p_period_days IS NOT NULL AND p_period_days BETWEEN 1 AND 366
                   THEN p_period_days ELSE 30 END;

    UPDATE public.delivery_ad_partner_memberships
    SET status = 'ACTIVE',
        period_start = now(),
        period_end = now() + make_interval(days => v_days),
        fee_snapshot_minor = coalesce(v_row.fee_snapshot_minor, v_cfg.monthly_fee_minor),
        currency = v_cfg.currency,
        benefit_snapshot = v_cfg.benefit_json,
        advertising_discount_percent_snapshot = v_cfg.advertising_discount_percent,
        config_version_snapshot = v_cfg.version,
        cancel_requested_at = NULL,
        updated_at = now()
    WHERE id = v_row.id
    RETURNING * INTO v_after;

    INSERT INTO public.delivery_ad_commercial_override_audit (
      entity_type, entity_id, actor_user_id, reason, before_json, after_json
    ) VALUES (
      'partner_membership', v_row.id::text, p_admin_user_id,
      coalesce(v_reason, 'admin_partner_approve'),
      jsonb_build_object('status', v_row.status),
      jsonb_build_object(
        'status', v_after.status,
        'fee_snapshot_minor', v_after.fee_snapshot_minor,
        'advertising_discount_percent_snapshot', v_after.advertising_discount_percent_snapshot,
        'config_version_snapshot', v_after.config_version_snapshot,
        'period_start', v_after.period_start,
        'period_end', v_after.period_end,
        'payment', 'BUSINESS_CASH_SECURED',
        'funding_id', v_fund.id
      )
    );
    RETURN jsonb_build_object('ok', true, 'membership', to_jsonb(v_after));
  END IF;

  -- reject
  v_refund := public.business_cash_delivery_ad_refund(p_admin_user_id, v_row.id, 'partner');
  IF coalesce((v_refund ->> 'ok')::boolean, false) IS NOT TRUE
     AND coalesce(v_refund ->> 'error', '') <> 'funding_not_found' THEN
    -- refund wrote nothing; membership stays PENDING_REVIEW.
    RETURN jsonb_build_object(
      'ok', false, 'error', 'refund_failed', 'detail', coalesce(v_refund ->> 'error', 'refund_failed')
    );
  END IF;

  UPDATE public.delivery_ad_partner_memberships
  SET status = 'REJECTED', updated_at = now()
  WHERE id = v_row.id
  RETURNING * INTO v_after;

  INSERT INTO public.delivery_ad_commercial_override_audit (
    entity_type, entity_id, actor_user_id, reason, before_json, after_json
  ) VALUES (
    'partner_membership', v_row.id::text, p_admin_user_id,
    coalesce(v_reason, 'admin_partner_reject'),
    jsonb_build_object('status', v_row.status),
    jsonb_build_object(
      'status', v_after.status,
      'refund', coalesce((v_refund ->> 'ok')::boolean, false),
      'refund_idempotent', coalesce((v_refund ->> 'idempotent')::boolean, false),
      'refund_ledger_id', v_refund -> 'refund_ledger_id'
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'membership', to_jsonb(v_after),
    'refund', coalesce((v_refund ->> 'ok')::boolean, false),
    'refund_idempotent', coalesce((v_refund ->> 'idempotent')::boolean, false)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.delivery_ad_partner_membership_expire_due_internal(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delivery_ad_partner_membership_expire_due(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.owner_apply_partner_membership(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_partner_membership_decide(uuid, uuid, text, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delivery_ad_partner_membership_expire_due(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.owner_apply_partner_membership(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_partner_membership_decide(uuid, uuid, text, text, integer) TO service_role;
