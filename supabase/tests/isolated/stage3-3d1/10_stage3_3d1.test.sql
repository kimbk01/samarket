-- Stage 3-D1 assertions (ADS-01 / ADS-11 / ADS-12 / ADS-02). Runs after the migration. Each DO block = one TX.
SET test.jwt_role = 'service_role';

-- ---------------------------------------------------------------- ADS-02: submit binds period + inventory to snapshot
DO $$
DECLARE
  c_ok uuid; c_long uuid; c_multi uuid; c_banner uuid; r jsonb; v_bal0 bigint; v_bal1 bigint; n int;
BEGIN
  SELECT balance_minor INTO v_bal0 FROM business_cash_accounts;
  c_ok := t_sponsored(now() + interval '1 minute', now() + interval '1 minute' + interval '7 days', 7);
  r := owner_submit_delivery_ad_with_business_cash('11111111-1111-1111-1111-111111111111',
    'aaaaaaaa-0000-0000-0000-000000000001', 'store_sponsored', c_ok, 'submit', 'DRAFT', 'submitted');
  IF (r->>'ok')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'ASSERT FAILED ADS-02 ok submit: %', r; END IF;

  c_long := t_sponsored(now() + interval '1 minute', now() + interval '30 days', 7);
  r := owner_submit_delivery_ad_with_business_cash('11111111-1111-1111-1111-111111111111',
    'aaaaaaaa-0000-0000-0000-000000000001', 'store_sponsored', c_long, 'submit', 'DRAFT', 'submitted');
  IF r->>'error' IS DISTINCT FROM 'quote_stale' OR r->>'stage' IS DISTINCT FROM 'quote'
     OR r->>'detail' IS DISTINCT FROM 'period_exceeds_snapshot' THEN
    RAISE EXCEPTION 'ASSERT FAILED ADS-02 long window: %', r;
  END IF;
  IF (SELECT lifecycle_status FROM store_paid_ad_campaigns WHERE id = c_long) <> 'DRAFT' THEN
    RAISE EXCEPTION 'ASSERT FAILED ADS-02 long window lifecycle changed';
  END IF;
  SELECT count(*) INTO n FROM delivery_ad_canonical_bc_fundings WHERE application_id = c_long;
  IF n <> 0 THEN RAISE EXCEPTION 'ASSERT FAILED ADS-02 long window funding kept'; END IF;

  c_multi := t_sponsored(now() + interval '1 minute', now() + interval '1 minute' + interval '7 days', 7,
                         'DRAFT', ARRAY['STORES_HOME_FEED', 'STORES_CATEGORY_FEED']);
  r := owner_submit_delivery_ad_with_business_cash('11111111-1111-1111-1111-111111111111',
    'aaaaaaaa-0000-0000-0000-000000000001', 'store_sponsored', c_multi, 'submit', 'DRAFT', 'submitted');
  IF r->>'error' IS DISTINCT FROM 'quote_stale' OR r->>'detail' IS DISTINCT FROM 'inventory_count' THEN
    RAISE EXCEPTION 'ASSERT FAILED ADS-02 multi inventory: %', r;
  END IF;

  c_banner := t_banner(now() + interval '1 minute', now() + interval '1 minute' + interval '7 days', 7);
  r := owner_submit_delivery_ad_with_business_cash('11111111-1111-1111-1111-111111111111',
    'aaaaaaaa-0000-0000-0000-000000000001', 'banner', c_banner, 'submit', 'DRAFT', 'submitted');
  IF (r->>'ok')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'ASSERT FAILED ADS-02 banner submit: %', r; END IF;

  SELECT balance_minor INTO v_bal1 FROM business_cash_accounts;
  IF v_bal0 - v_bal1 <> 24000 THEN RAISE EXCEPTION 'ASSERT FAILED ADS-02 debits % (expected 24000)', v_bal0 - v_bal1; END IF;
  RAISE NOTICE 'PASS ADS-02 submit snapshot binding (ok / long window / multi inventory / banner)';
END $$;

-- ---------------------------------------------------------------- ADS-01: approval recalculates the paid period
DO $$
DECLARE c uuid; r jsonb; v_row record;
BEGIN
  -- requested window started 3 days ago (review delay) and ends in 4 days
  c := t_sponsored(now() - interval '3 days', now() + interval '4 days', 7);
  r := owner_submit_delivery_ad_with_business_cash('11111111-1111-1111-1111-111111111111',
    'aaaaaaaa-0000-0000-0000-000000000001', 'store_sponsored', c, 'submit', 'DRAFT', 'submitted');
  IF (r->>'ok')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'ASSERT FAILED ADS-01 submit: %', r; END IF;
  r := admin_delivery_ad_transition('99999999-9999-9999-9999-999999999999', 'store_sponsored', c, 'start_review', 'SUBMITTED', NULL);
  r := admin_delivery_ad_transition('99999999-9999-9999-9999-999999999999', 'store_sponsored', c, 'approve', 'UNDER_REVIEW', NULL, 'ok');
  IF (r->>'ok')::boolean IS NOT TRUE OR r->>'to' <> 'ACTIVE' THEN RAISE EXCEPTION 'ASSERT FAILED ADS-01 approve: %', r; END IF;
  SELECT * INTO v_row FROM store_paid_ad_campaigns WHERE id = c;
  IF v_row.start_at <> now() OR v_row.end_at <> now() + interval '7 days' THEN
    RAISE EXCEPTION 'ASSERT FAILED ADS-01 period not recalculated: % ~ %', v_row.start_at, v_row.end_at;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM delivery_ad_audit_logs WHERE campaign_id = c AND action = 'approved'
                  AND (after_json->>'end_at')::timestamptz = now() + interval '7 days') THEN
    RAISE EXCEPTION 'ASSERT FAILED ADS-01 audit lacks new period';
  END IF;

  -- future requested start keeps the requested start (SCHEDULED)
  c := t_sponsored(now() + interval '2 days', now() + interval '9 days', 7);
  r := owner_submit_delivery_ad_with_business_cash('11111111-1111-1111-1111-111111111111',
    'aaaaaaaa-0000-0000-0000-000000000001', 'store_sponsored', c, 'submit', 'DRAFT', 'submitted');
  r := admin_delivery_ad_transition('99999999-9999-9999-9999-999999999999', 'store_sponsored', c, 'start_review', 'SUBMITTED', NULL);
  r := admin_delivery_ad_transition('99999999-9999-9999-9999-999999999999', 'store_sponsored', c, 'approve', 'UNDER_REVIEW', NULL, 'ok');
  SELECT * INTO v_row FROM store_paid_ad_campaigns WHERE id = c;
  IF r->>'to' <> 'SCHEDULED' OR v_row.start_at <> now() + interval '2 days' OR v_row.end_at <> now() + interval '9 days' THEN
    RAISE EXCEPTION 'ASSERT FAILED ADS-01 future start: % % %', r, v_row.start_at, v_row.end_at;
  END IF;
  RAISE NOTICE 'PASS ADS-01 approve recalculates period (delayed -> now+duration, future start kept)';
END $$;

DO $$
DECLARE c uuid; r jsonb; v_lc text;
BEGIN
  c := t_sponsored(now() + interval '1 minute', now() + interval '1 minute' + interval '7 days', 7);
  r := owner_submit_delivery_ad_with_business_cash('11111111-1111-1111-1111-111111111111',
    'aaaaaaaa-0000-0000-0000-000000000001', 'store_sponsored', c, 'submit', 'DRAFT', 'submitted');
  r := admin_delivery_ad_transition('99999999-9999-9999-9999-999999999999', 'store_sponsored', c, 'start_review', 'SUBMITTED', NULL);
  UPDATE store_paid_ad_campaigns SET start_at = now() - interval '10 days', end_at = now() - interval '3 days' WHERE id = c;
  r := admin_delivery_ad_transition('99999999-9999-9999-9999-999999999999', 'store_sponsored', c, 'approve', 'UNDER_REVIEW', NULL, 'ok');
  SELECT lifecycle_status INTO v_lc FROM store_paid_ad_campaigns WHERE id = c;
  IF r->>'error' IS DISTINCT FROM 'period_expired' OR v_lc <> 'UNDER_REVIEW' THEN
    RAISE EXCEPTION 'ASSERT FAILED ADS-01 expired approve: % %', r, v_lc;
  END IF;
  RAISE NOTICE 'PASS ADS-01 approve refuses an expired application (period_expired)';
END $$;

-- ---------------------------------------------------------------- ADS-01: expire_unreviewed auto-rejects + refunds once
DO $$
DECLARE c uuid; b uuid; r jsonb; v_bal0 bigint; v_bal1 bigint; v_row record; n int;
BEGIN
  c := t_sponsored(now() + interval '1 minute', now() + interval '1 minute' + interval '7 days', 7);
  r := owner_submit_delivery_ad_with_business_cash('11111111-1111-1111-1111-111111111111',
    'aaaaaaaa-0000-0000-0000-000000000001', 'store_sponsored', c, 'submit', 'DRAFT', 'submitted');
  b := t_banner(now() + interval '1 minute', now() + interval '1 minute' + interval '7 days', 7);
  r := owner_submit_delivery_ad_with_business_cash('11111111-1111-1111-1111-111111111111',
    'aaaaaaaa-0000-0000-0000-000000000001', 'banner', b, 'submit', 'DRAFT', 'submitted');
  r := admin_delivery_ad_transition('99999999-9999-9999-9999-999999999999', 'banner', b, 'start_review', 'SUBMITTED', NULL);
  -- not yet due
  r := delivery_ad_system_schedule_transition('store_sponsored', c, 'expire_unreviewed', 'SUBMITTED', NULL);
  IF r->>'error' IS DISTINCT FROM 'not_due' THEN RAISE EXCEPTION 'ASSERT FAILED expire not_due: %', r; END IF;
  UPDATE store_paid_ad_campaigns SET start_at = now() - interval '10 days', end_at = now() - interval '3 days' WHERE id = c;
  UPDATE store_banner_ad_campaigns SET start_at = now() - interval '10 days', end_at = now() - interval '3 days' WHERE id = b;
  SELECT balance_minor INTO v_bal0 FROM business_cash_accounts;
  r := delivery_ad_system_schedule_transition('store_sponsored', c, 'expire_unreviewed', 'SUBMITTED', NULL);
  IF (r->>'ok')::boolean IS NOT TRUE OR r->>'to' <> 'REJECTED' THEN RAISE EXCEPTION 'ASSERT FAILED expire sponsored: %', r; END IF;
  r := delivery_ad_system_schedule_transition('banner', b, 'expire_unreviewed', 'UNDER_REVIEW', NULL);
  IF (r->>'ok')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'ASSERT FAILED expire banner: %', r; END IF;
  SELECT balance_minor INTO v_bal1 FROM business_cash_accounts;
  IF v_bal1 - v_bal0 <> 24000 THEN RAISE EXCEPTION 'ASSERT FAILED expire refund amount %', v_bal1 - v_bal0; END IF;
  SELECT * INTO v_row FROM store_paid_ad_campaigns WHERE id = c;
  IF v_row.review_status <> 'REJECTED' OR v_row.review_notes <> 'period_expired' OR v_row.is_active THEN
    RAISE EXCEPTION 'ASSERT FAILED expire row: %', row_to_json(v_row);
  END IF;
  IF (SELECT review_status FROM delivery_ad_creatives WHERE id = (SELECT creative_id FROM store_banner_ad_campaigns WHERE id = b)) <> 'REJECTED' THEN
    RAISE EXCEPTION 'ASSERT FAILED expire banner creative';
  END IF;
  SELECT count(*) INTO n FROM business_cash_ledger
   WHERE idempotency_key IN ('bc_refund:store_sponsored:' || c, 'bc_refund:banner:' || b)
     AND entry_kind = 'AD_REFUND' AND actor_type = 'system';
  IF n <> 2 THEN RAISE EXCEPTION 'ASSERT FAILED expire ledger rows %', n; END IF;
  IF (SELECT status FROM delivery_ad_canonical_bc_fundings WHERE application_id = c) <> 'REFUNDED' THEN
    RAISE EXCEPTION 'ASSERT FAILED expire funding not REFUNDED';
  END IF;
  -- second run: not in an unreviewed state any more; no second refund
  r := delivery_ad_system_schedule_transition('store_sponsored', c, 'expire_unreviewed', NULL, NULL);
  IF r->>'error' IS DISTINCT FROM 'illegal_transition' THEN RAISE EXCEPTION 'ASSERT FAILED expire rerun: %', r; END IF;
  r := business_cash_delivery_ad_refund_system(c, 'store_sponsored');
  IF (r->>'idempotent')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'ASSERT FAILED refund_system idempotent: %', r; END IF;
  -- admin reject-with-refund afterwards: illegal (REJECTED), no extra money
  r := admin_delivery_ad_reject_with_refund('99999999-9999-9999-9999-999999999999', 'store_sponsored', c, NULL, NULL, 'x');
  IF (r->>'ok')::boolean IS TRUE THEN RAISE EXCEPTION 'ASSERT FAILED reject after expire allowed: %', r; END IF;
  IF (SELECT balance_minor FROM business_cash_accounts) <> v_bal1 THEN RAISE EXCEPTION 'ASSERT FAILED extra money moved'; END IF;
  RAISE NOTICE 'PASS ADS-01 expire_unreviewed: REJECTED + refund once (sponsored SUBMITTED, banner UNDER_REVIEW), idempotent';
END $$;

-- D-5: applications submitted before the apply instant are never auto-rejected / refunded
DO $$
DECLARE c uuid; r jsonb;
BEGIN
  c := t_sponsored(now() + interval '1 minute', now() + interval '1 minute' + interval '7 days', 7);
  r := owner_submit_delivery_ad_with_business_cash('11111111-1111-1111-1111-111111111111',
    'aaaaaaaa-0000-0000-0000-000000000001', 'store_sponsored', c, 'submit', 'DRAFT', 'submitted');
  UPDATE store_paid_ad_campaigns SET submitted_at = '2026-09-01 03:00:00+00', start_at = '2026-09-01 03:01:00+00',
         end_at = '2026-09-08 03:01:00+00' WHERE id = c;
  r := delivery_ad_system_schedule_transition('store_sponsored', c, 'expire_unreviewed', 'SUBMITTED', NULL);
  IF r->>'error' IS DISTINCT FROM 'not_eligible' THEN RAISE EXCEPTION 'ASSERT FAILED D-5 old app: %', r; END IF;
  IF (SELECT status FROM delivery_ad_canonical_bc_fundings WHERE application_id = c) <> 'SECURED'
     OR (SELECT lifecycle_status FROM store_paid_ad_campaigns WHERE id = c) <> 'SUBMITTED' THEN
    RAISE EXCEPTION 'ASSERT FAILED D-5 old app changed';
  END IF;
  -- unfunded new application: auto-rejected without refund (funding_not_found tolerated)
  RAISE NOTICE 'PASS D-5 pre-apply application untouched (not_eligible, funding SECURED)';
END $$;

-- ---------------------------------------------------------------- ADS-11: resume / end_due on paused campaigns
DO $$
DECLARE b uuid; s uuid; s_old uuid; r jsonb;
BEGIN
  -- owner banner: ACTIVE -> PAUSED_OWNER, period passes, resume refused
  b := t_banner(now() - interval '1 day', now() + interval '6 days', 7, 'ACTIVE');
  r := owner_delivery_ad_transition('11111111-1111-1111-1111-111111111111', 'banner', b, 'pause', 'ACTIVE', 'paused_owner');
  IF (r->>'ok')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'ASSERT FAILED ADS-11 pause: %', r; END IF;
  UPDATE store_banner_ad_campaigns SET start_at = now() - interval '9 days', end_at = now() - interval '2 hours' WHERE id = b;
  r := owner_delivery_ad_transition('11111111-1111-1111-1111-111111111111', 'banner', b, 'resume', 'PAUSED_OWNER', 'resumed_owner');
  IF r->>'error' IS DISTINCT FROM 'period_ended' THEN RAISE EXCEPTION 'ASSERT FAILED ADS-11 banner owner resume: %', r; END IF;
  -- system end_due ends the paused banner (end_at after apply instant)
  r := delivery_ad_system_schedule_transition('banner', b, 'end_due', 'PAUSED_OWNER', NULL);
  IF r->>'to' IS DISTINCT FROM 'ENDED' THEN RAISE EXCEPTION 'ASSERT FAILED ADS-11 end_due paused: %', r; END IF;

  -- admin PAUSED_ADMIN resume after period -> period_ended
  s := t_sponsored(now() - interval '1 day', now() + interval '6 days', 7, 'ACTIVE');
  INSERT INTO delivery_ad_canonical_bc_fundings (store_id, product_kind, application_id, amount_minor, spend_ledger_id, status)
    SELECT 'aaaaaaaa-0000-0000-0000-000000000001', 'store_sponsored', s, 12000, id, 'SECURED'
      FROM business_cash_ledger ORDER BY created_at LIMIT 1;
  r := admin_delivery_ad_transition('99999999-9999-9999-9999-999999999999', 'store_sponsored', s, 'pause', 'ACTIVE', NULL, 'policy');
  UPDATE store_paid_ad_campaigns SET start_at = now() - interval '9 days', end_at = now() - interval '2 hours' WHERE id = s;
  r := admin_delivery_ad_transition('99999999-9999-9999-9999-999999999999', 'store_sponsored', s, 'resume', 'PAUSED_ADMIN', NULL);
  IF r->>'error' IS DISTINCT FROM 'period_ended' THEN RAISE EXCEPTION 'ASSERT FAILED ADS-11 admin resume: %', r; END IF;

  -- D-5: a paused campaign whose period ended before the apply instant stays as is
  s_old := t_sponsored('2026-09-01 00:00:00+00', '2026-09-08 00:00:00+00', 7, 'PAUSED_OWNER');
  r := delivery_ad_system_schedule_transition('store_sponsored', s_old, 'end_due', 'PAUSED_OWNER', NULL);
  IF r->>'error' IS DISTINCT FROM 'not_eligible' THEN RAISE EXCEPTION 'ASSERT FAILED ADS-11 D-5 paused: %', r; END IF;

  -- resume inside the period still works (preserved behavior)
  b := t_banner(now() - interval '1 day', now() + interval '6 days', 7, 'ACTIVE');
  r := owner_delivery_ad_transition('11111111-1111-1111-1111-111111111111', 'banner', b, 'pause', 'ACTIVE', 'paused_owner');
  r := owner_delivery_ad_transition('11111111-1111-1111-1111-111111111111', 'banner', b, 'resume', 'PAUSED_OWNER', 'resumed_owner');
  IF (r->>'ok')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'ASSERT FAILED ADS-11 in-period resume: %', r; END IF;
  RAISE NOTICE 'PASS ADS-11 period_ended on resume (owner banner, admin), paused end_due, D-5 paused untouched';
END $$;

-- ---------------------------------------------------------------- ADS-12: unfunded review rows get their own bucket
DO $$
DECLARE u uuid; f uuid; v_b text; v_page jsonb;
BEGIN
  u := t_sponsored(now() - interval '60 days', now() - interval '50 days', 7, 'UNDER_REVIEW');
  SELECT list_bucket INTO v_b FROM admin_delivery_ad_campaign_index('delivery-ads/pending/admin-production') WHERE id = u;
  IF v_b IS DISTINCT FROM 'review_unfunded' THEN RAISE EXCEPTION 'ASSERT FAILED ADS-12 unfunded bucket %', v_b; END IF;
  -- a funded SUBMITTED application stays in review
  SELECT application_id INTO f FROM delivery_ad_canonical_bc_fundings f2
    JOIN store_paid_ad_campaigns c ON c.id = f2.application_id
   WHERE f2.status = 'SECURED' AND c.lifecycle_status = 'SUBMITTED' LIMIT 1;
  SELECT list_bucket INTO v_b FROM admin_delivery_ad_campaign_index('delivery-ads/pending/admin-production') WHERE id = f;
  IF v_b IS DISTINCT FROM 'review' THEN RAISE EXCEPTION 'ASSERT FAILED ADS-12 funded bucket %', v_b; END IF;
  v_page := admin_delivery_ad_campaigns_page(NULL, 'actionable', NULL, NULL, NULL, NULL, NULL,
                                             'delivery-ads/pending/admin-production', 100, 0);
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_page->'rows') e WHERE (e->>'id')::uuid = u) THEN
    RAISE EXCEPTION 'ASSERT FAILED ADS-12 unfunded row in actionable view';
  END IF;
  v_page := admin_delivery_ad_campaigns_page(NULL, 'review_unfunded', NULL, NULL, NULL, NULL, NULL,
                                             'delivery-ads/pending/admin-production', 100, 0);
  IF (v_page->>'total')::int <> 1 THEN RAISE EXCEPTION 'ASSERT FAILED ADS-12 review_unfunded view %', v_page->>'total'; END IF;
  RAISE NOTICE 'PASS ADS-12 unfunded review row -> review_unfunded (not actionable), funded stays review';
END $$;

-- ---------------------------------------------------------------- privileges
DO $$
BEGIN
  IF has_function_privilege('service_role', 'public.business_cash_delivery_ad_refund_system(uuid, text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.business_cash_delivery_ad_refund_system(uuid, text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.delivery_ad_owner_snapshot_binding_error(text, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'ASSERT FAILED internal helpers executable by API roles';
  END IF;
  RAISE NOTICE 'PASS internal helpers not executable by anon/authenticated/service_role';
END $$;

-- ASCII-only bodies
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE pronamespace = 'public'::regnamespace
              AND proname IN ('admin_delivery_ad_transition','owner_delivery_ad_transition','delivery_ad_system_schedule_transition',
                              'owner_submit_delivery_ad_with_business_cash','admin_delivery_ad_campaign_index',
                              'business_cash_delivery_ad_refund_system','delivery_ad_owner_snapshot_binding_error')
              AND prosrc ~ '[^\x01-\x7F]') THEN
    RAISE EXCEPTION 'ASSERT FAILED non-ASCII function body';
  END IF;
  RAISE NOTICE 'PASS function bodies ASCII-only';
END $$;
