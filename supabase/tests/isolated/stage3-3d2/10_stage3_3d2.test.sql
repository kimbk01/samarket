-- Stage 3-D2 assertions (single session). Races are in run.sh.
\set ON_ERROR_STOP 1

CREATE OR REPLACE FUNCTION pg_temp.assert(p boolean, p_msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF p IS NOT TRUE THEN RAISE EXCEPTION 'ASSERT FAILED: %', p_msg; END IF; END $$;

DO $$
DECLARE
  S1 constant uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  S2 constant uuid := 'aaaaaaaa-0000-0000-0000-000000000002';
  S3 constant uuid := 'aaaaaaaa-0000-0000-0000-000000000003';
  OWN constant uuid := '11111111-1111-1111-1111-111111111111';
  ADM constant uuid := '99999999-9999-9999-9999-999999999999';
  LEGACY constant uuid := 'bbbbbbbb-0000-0000-0000-00000000000e';
  r jsonb;
  m1 uuid;
  m2 uuid;
  v_legacy_upd timestamptz;
BEGIN
  SELECT updated_at INTO v_legacy_upd FROM delivery_ad_partner_memberships WHERE id = LEGACY;

  -- ADS-04: apply = row + debit in one TX.
  r := owner_apply_partner_membership(S1, OWN, 'k1');
  PERFORM pg_temp.assert((r->>'ok')::boolean AND NOT (r->>'idempotent')::boolean, 'apply ok ' || r::text);
  m1 := (r->'membership'->>'id')::uuid;
  PERFORM pg_temp.assert(t_bal(S1) = 40000, 'debited once');
  PERFORM pg_temp.assert((SELECT count(*) FROM delivery_ad_partner_memberships WHERE store_id = S1) = 1, 'one row');
  PERFORM pg_temp.assert((SELECT status FROM delivery_ad_canonical_bc_fundings WHERE application_id = m1) = 'SECURED', 'funding secured');
  PERFORM pg_temp.assert((SELECT count(*) FROM business_cash_ledger WHERE store_id = S1 AND entry_kind = 'PARTNER_SPEND') = 1, 'one spend ledger');
  PERFORM pg_temp.assert((SELECT count(*) FROM delivery_ad_commercial_override_audit WHERE entity_id = m1::text AND reason = 'owner_partner_apply') = 1, 'apply audit');

  -- replay same key: idempotent, no second debit.
  r := owner_apply_partner_membership(S1, OWN, 'k1');
  PERFORM pg_temp.assert((r->>'ok')::boolean AND (r->>'idempotent')::boolean AND (r->'membership'->>'id')::uuid = m1, 'replay ' || r::text);
  PERFORM pg_temp.assert(t_bal(S1) = 40000, 'replay no debit');

  -- second apply while open: already_open, no debit.
  r := owner_apply_partner_membership(S1, OWN, 'k2');
  PERFORM pg_temp.assert(r->>'error' = 'already_open', 'already_open ' || r::text);
  PERFORM pg_temp.assert(t_bal(S1) = 40000, 'already_open no debit');

  -- missing key / wrong owner.
  r := owner_apply_partner_membership(S1, OWN, ' ');
  PERFORM pg_temp.assert(r->>'error' = 'idempotency_key_required', 'key required');
  r := owner_apply_partner_membership(S1, '22222222-2222-2222-2222-222222222222', 'kx');
  PERFORM pg_temp.assert(r->>'error' = 'forbidden', 'forbidden owner');

  -- insufficient Cash: no membership row, no funding (no orphan).
  r := owner_apply_partner_membership(S3, OWN, 'k3');
  PERFORM pg_temp.assert(r->>'error' = 'INSUFFICIENT_BUSINESS_CASH' AND (r->>'shortage_minor')::bigint = 5000, 'insufficient ' || r::text);
  PERFORM pg_temp.assert((SELECT count(*) FROM delivery_ad_partner_memberships WHERE store_id = S3) = 0, 'no row on insufficient');
  PERFORM pg_temp.assert((SELECT count(*) FROM delivery_ad_canonical_bc_fundings WHERE store_id = S3) = 0, 'no funding on insufficient');
  PERFORM pg_temp.assert(t_bal(S3) = 5000, 'no debit on insufficient');

  -- ADS-05 / D-5: legacy expired ACTIVE row does not block; it is not modified.
  r := owner_apply_partner_membership(S2, OWN, 'k4');
  PERFORM pg_temp.assert((r->>'ok')::boolean, 'legacy expired does not block ' || r::text);
  m2 := (r->'membership'->>'id')::uuid;
  PERFORM pg_temp.assert((SELECT status = 'ACTIVE' AND updated_at = v_legacy_upd FROM delivery_ad_partner_memberships WHERE id = LEGACY), 'legacy untouched');

  -- ADS-03: decide. non-admin forbidden.
  r := admin_partner_membership_decide(OWN, m1, 'reject', 'x', NULL);
  PERFORM pg_temp.assert(r->>'error' = 'forbidden', 'non-admin forbidden');
  r := admin_partner_membership_decide(ADM, m1, 'reject', 'spam', NULL);
  PERFORM pg_temp.assert((r->>'ok')::boolean AND r->'membership'->>'status' = 'REJECTED' AND (r->>'refund')::boolean, 'reject ' || r::text);
  PERFORM pg_temp.assert(t_bal(S1) = 50000, 'refunded');
  PERFORM pg_temp.assert((SELECT status FROM delivery_ad_canonical_bc_fundings WHERE application_id = m1) = 'REFUNDED', 'funding refunded');
  r := admin_partner_membership_decide(ADM, m1, 'approve', 'late', NULL);
  PERFORM pg_temp.assert(r->>'error' = 'illegal_transition', 'approve after reject refused');
  r := admin_partner_membership_decide(ADM, m1, 'reject', 'again', NULL);
  PERFORM pg_temp.assert(r->>'error' = 'illegal_transition', 'double reject refused');
  PERFORM pg_temp.assert((SELECT count(*) FROM business_cash_ledger WHERE store_id = S1 AND entry_kind = 'PARTNER_REFUND') = 1, 'one refund ledger');

  -- approve: funding re-check + ACTIVE with snapshots.
  r := admin_partner_membership_decide(ADM, m2, 'approve', 'ok', 30);
  PERFORM pg_temp.assert((r->>'ok')::boolean AND r->'membership'->>'status' = 'ACTIVE', 'approve ' || r::text);
  PERFORM pg_temp.assert((SELECT advertising_discount_percent_snapshot = 10 AND config_version_snapshot = 3
      AND period_end > now() + interval '29 days' FROM delivery_ad_partner_memberships WHERE id = m2), 'approve snapshots');

  -- approve without funding -> funding_required (legacy unfunded PENDING row).
  INSERT INTO delivery_ad_partner_memberships (id, store_id, status, created_at)
  VALUES ('bbbbbbbb-0000-0000-0000-0000000000f1', 'aaaaaaaa-0000-0000-0000-000000000004', 'PENDING_REVIEW', '2026-09-01 00:00:00+00');
  r := admin_partner_membership_decide(ADM, 'bbbbbbbb-0000-0000-0000-0000000000f1', 'approve', 'ok', NULL);
  PERFORM pg_temp.assert(r->>'error' = 'funding_required', 'funding_required');
  -- reject without funding -> REJECTED, no refund ledger.
  r := admin_partner_membership_decide(ADM, 'bbbbbbbb-0000-0000-0000-0000000000f1', 'reject', 'unfunded', NULL);
  PERFORM pg_temp.assert((r->>'ok')::boolean AND NOT (r->>'refund')::boolean, 'unfunded reject');

  -- ADS-04 index: a second open row (created after the apply instant) for the same store is refused by the DB.
  BEGIN
    INSERT INTO delivery_ad_partner_memberships (store_id, status) VALUES (S2, 'PENDING_REVIEW');
    RAISE EXCEPTION 'ASSERT FAILED: open-row unique index missing';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  -- ADS-05 expiry: period passed -> ENDED by the cron function; legacy row (period_end < apply instant) untouched.
  UPDATE delivery_ad_partner_memberships SET period_end = now() - interval '1 minute' WHERE id = m2;
  r := delivery_ad_partner_membership_expire_due(200);
  PERFORM pg_temp.assert((r->>'ended')::int = 1, 'expire ended 1 ' || r::text);
  PERFORM pg_temp.assert((SELECT status FROM delivery_ad_partner_memberships WHERE id = m2) = 'ENDED', 'm2 ended');
  PERFORM pg_temp.assert((SELECT status = 'ACTIVE' AND updated_at = v_legacy_upd FROM delivery_ad_partner_memberships WHERE id = LEGACY), 'legacy still untouched');
  PERFORM pg_temp.assert((SELECT count(*) FROM delivery_ad_commercial_override_audit WHERE entity_id = m2::text AND reason = 'system_partner_period_expired') = 1, 'expiry audit');
  r := delivery_ad_partner_membership_expire_due(200);
  PERFORM pg_temp.assert((r->>'ended')::int = 0, 'expire idempotent');

  -- apply path closes its own expired post-apply-instant row before inserting (index stays satisfiable).
  r := owner_apply_partner_membership(S2, OWN, 'k5');
  m2 := (r->'membership'->>'id')::uuid;
  PERFORM admin_partner_membership_decide(ADM, m2, 'approve', 'ok', NULL);
  UPDATE delivery_ad_partner_memberships SET period_end = now() - interval '1 minute' WHERE id = m2;
  r := owner_apply_partner_membership(S2, OWN, 'k6');
  PERFORM pg_temp.assert((r->>'ok')::boolean, 'reapply after expiry ' || r::text);
  PERFORM pg_temp.assert((SELECT status FROM delivery_ad_partner_memberships WHERE id = m2) = 'ENDED', 'apply ended expired row');

  RAISE NOTICE 'PASS partner membership (ADS-03/04/05)';
END $$;

-- ADS-13 platform popup submit.
DO $$
DECLARE
  S4 constant uuid := 'aaaaaaaa-0000-0000-0000-000000000004';
  S3 constant uuid := 'aaaaaaaa-0000-0000-0000-000000000003';
  OWN constant uuid := '11111111-1111-1111-1111-111111111111';
  q1 uuid := gen_random_uuid();
  q2 uuid := gen_random_uuid();
  q3 uuid := gen_random_uuid();
  r jsonb;
  b0 bigint;
BEGIN
  INSERT INTO platform_popup_owner_requests (id, owner_user_id, store_id, package_id, price_minor, creative_asset_path)
  VALUES (q1, OWN, S4, gen_random_uuid(), 7000, 'x.png'),
         (q2, OWN, S3, gen_random_uuid(), 7000, 'y.png'),
         (q3, OWN, S4, NULL, NULL, 'z.png');
  b0 := t_bal(S4);

  r := owner_submit_platform_popup_request(q3, OWN, 'p3');
  PERFORM pg_temp.assert(r->>'error' = 'package_required', 'package_required');

  r := owner_submit_platform_popup_request(q2, OWN, 'p2');
  PERFORM pg_temp.assert(r->>'error' = 'INSUFFICIENT_BUSINESS_CASH', 'popup insufficient ' || r::text);
  PERFORM pg_temp.assert((SELECT request_status = 'draft' AND payment_status = 'failed' AND submit_idempotency_key IS NULL
      FROM platform_popup_owner_requests WHERE id = q2), 'popup failed state');
  PERFORM pg_temp.assert((SELECT count(*) FROM delivery_ad_canonical_bc_fundings WHERE application_id = q2) = 0, 'popup no funding');

  r := owner_submit_platform_popup_request(q1, '22222222-2222-2222-2222-222222222222', 'p1');
  PERFORM pg_temp.assert(r->>'error' = 'forbidden', 'popup forbidden');

  r := owner_submit_platform_popup_request(q1, OWN, 'p1');
  PERFORM pg_temp.assert((r->>'ok')::boolean AND r->'request'->>'request_status' = 'submitted'
      AND r->'request'->>'payment_status' = 'funded', 'popup submit ' || r::text);
  PERFORM pg_temp.assert(t_bal(S4) = b0 - 7000, 'popup debited');

  r := owner_submit_platform_popup_request(q1, OWN, 'p1');
  PERFORM pg_temp.assert((r->>'ok')::boolean AND (r->>'idempotent')::boolean, 'popup replay');
  r := owner_submit_platform_popup_request(q1, OWN, 'p1b');
  PERFORM pg_temp.assert(r->>'error' = 'illegal_transition', 'popup second key refused');
  PERFORM pg_temp.assert(t_bal(S4) = b0 - 7000, 'popup single debit');

  -- revision resubmit keeps the funding (no second debit).
  UPDATE platform_popup_owner_requests SET request_status = 'revision_required' WHERE id = q1;
  r := owner_submit_platform_popup_request(q1, OWN, 'p1c');
  PERFORM pg_temp.assert((r->>'ok')::boolean AND (r->>'idempotent')::boolean, 'resubmit idempotent funding ' || r::text);
  PERFORM pg_temp.assert(t_bal(S4) = b0 - 7000, 'resubmit no debit');

  RAISE NOTICE 'PASS platform popup submit (ADS-13)';
END $$;

-- ACL: service_role only.
DO $$
BEGIN
  PERFORM pg_temp.assert(NOT has_function_privilege('authenticated', 'public.owner_apply_partner_membership(uuid,uuid,text)', 'EXECUTE'), 'acl apply');
  PERFORM pg_temp.assert(NOT has_function_privilege('anon', 'public.admin_partner_membership_decide(uuid,uuid,text,text,integer)', 'EXECUTE'), 'acl decide');
  PERFORM pg_temp.assert(NOT has_function_privilege('authenticated', 'public.owner_submit_platform_popup_request(uuid,uuid,text)', 'EXECUTE'), 'acl popup');
  PERFORM pg_temp.assert(NOT has_function_privilege('authenticated', 'public.delivery_ad_partner_membership_expire_due_internal(uuid,integer)', 'EXECUTE'), 'acl internal');
  PERFORM pg_temp.assert(has_function_privilege('service_role', 'public.owner_apply_partner_membership(uuid,uuid,text)', 'EXECUTE'), 'acl sr');
  RAISE NOTICE 'PASS acl';
END $$;
