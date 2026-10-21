-- FIN-04: owner top-up request RPC (evidence, idempotency, PENDING-1, caps) + approval guards.
SET test.jwt_role = 'service_role';

DO $$
BEGIN
  PERFORM public.t_assert(to_regprocedure('public.approve_business_cash_charge_request(uuid,uuid)') IS NULL, 'old 2-arg overload dropped');
  PERFORM public.t_assert(to_regprocedure('public.approve_business_cash_charge_request(uuid,uuid,text)') IS NOT NULL, 'new 3-arg approve exists');
  PERFORM public.t_assert(NOT has_function_privilege('authenticated', 'public.approve_business_cash_charge_request(uuid,uuid,text)', 'EXECUTE'), 'approve: authenticated no EXECUTE');
  PERFORM public.t_assert(has_function_privilege('service_role', 'public.approve_business_cash_charge_request(uuid,uuid,text)', 'EXECUTE'), 'approve: service_role EXECUTE');
  PERFORM public.t_assert(NOT has_function_privilege('anon', 'public.owner_create_business_cash_charge_request(uuid,uuid,bigint,text,text,text,text)', 'EXECUTE'), 'create: anon no EXECUTE');
  PERFORM public.t_assert(NOT has_function_privilege('authenticated', 'public.owner_create_business_cash_charge_request(uuid,uuid,bigint,text,text,text,text)', 'EXECUTE'), 'create: authenticated no EXECUTE');
  PERFORM public.t_assert(has_function_privilege('service_role', 'public.owner_create_business_cash_charge_request(uuid,uuid,bigint,text,text,text,text)', 'EXECUTE'), 'create: service_role EXECUTE');
  -- default policy = no caps, reference required
  PERFORM public.t_assert(public.business_cash_charge_policy() = jsonb_build_object(
    'per_request_max_minor', NULL, 'monthly_max_minor', NULL, 'payment_methods', '["bank_transfer","gcash","other"]'::jsonb,
    'receiving_account_note', NULL, 'payment_reference_required', true), 'default policy: no caps');
  RAISE NOTICE 'PASS FIN-04 signatures / grants / default policy';
END $$;

DO $$
DECLARE
  v_store uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  v_owner uuid := '11111111-1111-1111-1111-111111111111';
  v_admin uuid := '44444444-4444-4444-4444-444444444444';
  v_res jsonb; v_res2 jsonb; v_req uuid;
BEGIN
  -- non service_role JWT refused
  PERFORM set_config('test.jwt_role', 'authenticated', true);
  v_res := public.owner_create_business_cash_charge_request(v_owner, v_store, 1000, 'gcash', 'REF-X', NULL, 'k-forbidden');
  PERFORM public.t_assert(v_res->>'error' = 'forbidden', 'create: authenticated JWT forbidden');
  PERFORM set_config('test.jwt_role', 'service_role', true);

  -- validation
  v_res := public.owner_create_business_cash_charge_request(v_owner, v_store, 1000, 'gcash', NULL, NULL, 'k-noref');
  PERFORM public.t_assert(v_res->>'error' = 'payment_reference_required', 'missing reference rejected: ' || v_res::text);
  v_res := public.owner_create_business_cash_charge_request(v_owner, v_store, 1000, 'gcash', '  ', NULL, 'k-blankref');
  PERFORM public.t_assert(v_res->>'error' = 'payment_reference_required', 'blank reference rejected');
  v_res := public.owner_create_business_cash_charge_request(v_owner, v_store, 1000, NULL, 'REF-1', NULL, 'k-nomethod');
  PERFORM public.t_assert(v_res->>'error' = 'payment_method_required', 'missing method rejected');
  v_res := public.owner_create_business_cash_charge_request(v_owner, v_store, 1000, 'paypal', 'REF-1', NULL, 'k-badmethod');
  PERFORM public.t_assert(v_res->>'error' = 'payment_method_required', 'method outside policy rejected');
  v_res := public.owner_create_business_cash_charge_request(v_owner, v_store, 1000, 'gcash', 'REF-1', NULL, NULL);
  PERFORM public.t_assert(v_res->>'error' = 'idempotency_required', 'missing idempotency key rejected');
  v_res := public.owner_create_business_cash_charge_request(v_owner, v_store, 0, 'gcash', 'REF-1', NULL, 'k-zero');
  PERFORM public.t_assert(v_res->>'error' = 'invalid_amount', 'zero amount rejected');
  v_res := public.owner_create_business_cash_charge_request('22222222-2222-2222-2222-222222222222', v_store, 1000, 'gcash', 'REF-1', NULL, 'k-notowner');
  PERFORM public.t_assert(v_res->>'error' = 'not_store_owner', 'non-owner rejected');
  PERFORM public.t_assert((SELECT count(*) FROM public.business_cash_charge_requests WHERE store_id = v_store AND status = 'PENDING') = 0, 'no rows from rejected calls');

  -- same idempotency key twice -> one request
  v_res := public.owner_create_business_cash_charge_request(v_owner, v_store, 1500, 'GCash', ' GC-0001 ', 'proof/a.png', 'form-key-1');
  v_res2 := public.owner_create_business_cash_charge_request(v_owner, v_store, 1500, 'GCash', ' GC-0001 ', 'proof/a.png', 'form-key-1');
  PERFORM public.t_assert(v_res->>'ok' = 'true' AND v_res->>'idempotent' = 'false', 'first create ok');
  PERFORM public.t_assert(v_res2->>'ok' = 'true' AND v_res2->>'idempotent' = 'true' AND v_res2->>'request_id' = v_res->>'request_id', 'same key replay -> same request');
  PERFORM public.t_assert((SELECT count(*) FROM public.business_cash_charge_requests WHERE idempotency_key = 'form-key-1') = 1, 'same key -> 1 row');
  v_req := (v_res->>'request_id')::uuid;
  PERFORM public.t_assert((SELECT payment_method = 'gcash' AND payment_reference = 'GC-0001' AND proof_file_path = 'proof/a.png'
                             FROM public.business_cash_charge_requests WHERE id = v_req), 'evidence stored normalized');
  -- same key, different amount -> refused (never returns someone else's request)
  v_res2 := public.owner_create_business_cash_charge_request(v_owner, v_store, 9999, 'gcash', 'GC-0001', NULL, 'form-key-1');
  PERFORM public.t_assert(v_res2->>'error' = 'idempotency_key_reused', 'same key other amount refused');

  -- second PENDING for the same store refused
  v_res2 := public.owner_create_business_cash_charge_request(v_owner, v_store, 700, 'bank_transfer', 'BANK-77', NULL, 'form-key-2');
  PERFORM public.t_assert(v_res2->>'error' = 'pending_request_exists', 'second PENDING rejected: ' || v_res2::text);

  -- approval guards
  v_res2 := public.approve_business_cash_charge_request('22222222-2222-2222-2222-222222222222', v_req, 'ok ok');
  PERFORM public.t_assert(v_res2->>'error' = 'admin_required', 'non-admin approver rejected');
  v_res2 := public.approve_business_cash_charge_request(v_admin, v_req);
  PERFORM public.t_assert(v_res2->>'error' = 'reason_required', 'approval without reason rejected (2-arg call compatible)');
  v_res2 := public.approve_business_cash_charge_request(v_admin, v_req, 'GCash GC-0001 matched');
  PERFORM public.t_assert(v_res2->>'ok' = 'true' AND v_res2->>'idempotent' = 'false', 'admin approval ok: ' || v_res2::text);
  PERFORM public.t_assert((SELECT decided_reason = 'GCash GC-0001 matched' AND admin_user_id = v_admin AND status = 'APPROVED'
                             FROM public.business_cash_charge_requests WHERE id = v_req), 'decided_reason stored');
  PERFORM public.t_assert((SELECT meta->>'payment_reference' = 'GC-0001' FROM public.business_cash_ledger
                            WHERE idempotency_key = 'bc_topup:' || v_req::text), 'ledger meta carries reference');
  v_res2 := public.approve_business_cash_charge_request(v_admin, v_req, 'again');
  PERFORM public.t_assert(v_res2->>'idempotent' = 'true', 'approval replay idempotent');
  PERFORM public.t_assert((SELECT count(*) FROM public.business_cash_ledger WHERE idempotency_key = 'bc_topup:' || v_req::text) = 1, 'one TOP_UP row');

  -- reference unique per store among live requests (case/space-insensitive) ...
  v_res2 := public.owner_create_business_cash_charge_request(v_owner, v_store, 700, 'gcash', 'gc-0001', NULL, 'form-key-3');
  PERFORM public.t_assert(v_res2->>'error' = 'payment_reference_duplicate', 'reused reference rejected');
  -- ... but a rejected request's reference may be resubmitted
  v_res2 := public.owner_create_business_cash_charge_request(v_owner, v_store, 700, 'gcash', 'GC-0002', NULL, 'form-key-4');
  PERFORM public.t_assert(v_res2->>'ok' = 'true', 'new request after approval ok');
  PERFORM public.t_assert((public.reject_business_cash_charge_request(v_admin, (v_res2->>'request_id')::uuid, 'not found')->>'ok') = 'true', 'reject ok');
  v_res2 := public.owner_create_business_cash_charge_request(v_owner, v_store, 700, 'gcash', 'GC-0002', NULL, 'form-key-5');
  PERFORM public.t_assert(v_res2->>'ok' = 'true', 'reference of a rejected request may be reused');
  PERFORM public.t_assert((public.reject_business_cash_charge_request(v_admin, (v_res2->>'request_id')::uuid, 'cleanup')->>'ok') = 'true', 'reject cleanup');
  RAISE NOTICE 'PASS FIN-04 owner create: validation, same key -> 1 request, second PENDING rejected, reference unique, approval guards';
END $$;

-- Self-store approval: an admin who owns the store cannot approve it; another admin can.
DO $$
DECLARE
  v_store uuid := 'aaaaaaaa-0000-0000-0000-000000000002';
  v_owneradmin uuid := '66666666-6666-6666-6666-666666666666';
  v_res jsonb; v_req uuid;
BEGIN
  v_res := public.owner_create_business_cash_charge_request(v_owneradmin, v_store, 5000, 'bank_transfer', 'BPI-123', NULL, 'b-key-1');
  PERFORM public.t_assert(v_res->>'ok' = 'true', 'store B create ok');
  v_req := (v_res->>'request_id')::uuid;
  v_res := public.approve_business_cash_charge_request(v_owneradmin, v_req, 'my own deposit');
  PERFORM public.t_assert(v_res->>'error' = 'self_store_approval_forbidden', 'self-store approval rejected: ' || v_res::text);
  PERFORM public.t_assert((SELECT status FROM public.business_cash_charge_requests WHERE id = v_req) = 'PENDING', 'still PENDING');
  PERFORM public.t_assert(NOT EXISTS (SELECT 1 FROM public.business_cash_accounts WHERE store_id = v_store AND balance_minor > 0), 'no Cash credited');
  v_res := public.approve_business_cash_charge_request('55555555-5555-5555-5555-555555555555', v_req, 'BPI-123 matched');
  PERFORM public.t_assert(v_res->>'ok' = 'true', 'other admin approval ok');
  RAISE NOTICE 'PASS FIN-04 self-store approval rejected, other admin approves';
END $$;

-- Legacy (pre-FIN-04) PENDING without reference cannot be credited; it can still be rejected.
DO $$
DECLARE v_req uuid; v_res jsonb;
BEGIN
  v_req := public.t_legacy_request('aaaaaaaa-0000-0000-0000-000000000004', 1200);
  v_res := public.approve_business_cash_charge_request('44444444-4444-4444-4444-444444444444', v_req, 'looks fine');
  PERFORM public.t_assert(v_res->>'error' = 'payment_reference_missing', 'no-reference request not credited');
  v_res := public.reject_business_cash_charge_request('44444444-4444-4444-4444-444444444444', v_req, 'no reference');
  PERFORM public.t_assert(v_res->>'ok' = 'true', 'no-reference request rejectable');
  RAISE NOTICE 'PASS FIN-04 legacy no-reference PENDING: approve refused, reject ok';
END $$;

-- Caps from settings (D-4 values are settings only).
DO $$
DECLARE v_res jsonb;
BEGIN
  INSERT INTO public.admin_settings(key, value_json)
  VALUES ('business_cash_charge_policy', '{"per_request_max_minor": 5000, "monthly_max_minor": 8000, "payment_methods": ["gcash"]}');
  v_res := public.owner_create_business_cash_charge_request('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 6000, 'gcash', 'CAP-1', NULL, 'cap-1');
  PERFORM public.t_assert(v_res->>'error' = 'amount_exceeds_request_cap', 'per-request cap: ' || v_res::text);
  -- store A this month: 1,500 approved (+2x2,000 from FIN-02) = 5,500 -> 3,000 more exceeds 8,000
  v_res := public.owner_create_business_cash_charge_request('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 3000, 'gcash', 'CAP-2', NULL, 'cap-2');
  PERFORM public.t_assert(v_res->>'error' = 'amount_exceeds_monthly_cap', 'monthly cap: ' || v_res::text);
  v_res := public.owner_create_business_cash_charge_request('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 1000, 'bank_transfer', 'CAP-3', NULL, 'cap-3');
  PERFORM public.t_assert(v_res->>'error' = 'payment_method_required', 'method list from settings');
  DELETE FROM public.admin_settings WHERE key = 'business_cash_charge_policy';
  RAISE NOTICE 'PASS FIN-04 caps / methods come from settings';
END $$;
