-- Test helpers + actors (fixed UUIDs). Test-only functions are prefixed t_.
-- owner      11111111-...  owns store A (aaaaaaaa-...-01) and legacy store C (...-03)
-- other      22222222-...  plain member
-- admin      44444444-...  active admin (business approver)
-- super      55555555-...  active super_admin
-- owneradmin 66666666-...  active admin who owns store B (...-02)

INSERT INTO auth.users(id) VALUES
  ('11111111-1111-1111-1111-111111111111'), ('22222222-2222-2222-2222-222222222222'),
  ('44444444-4444-4444-4444-444444444444'), ('55555555-5555-5555-5555-555555555555'),
  ('66666666-6666-6666-6666-666666666666');
INSERT INTO public.admin_memberships(user_id, role, status) VALUES
  ('44444444-4444-4444-4444-444444444444', 'admin', 'active'),
  ('55555555-5555-5555-5555-555555555555', 'super_admin', 'active'),
  ('66666666-6666-6666-6666-666666666666', 'admin', 'active');
INSERT INTO public.stores(id, owner_user_id, store_name) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Store A'),
  ('aaaaaaaa-0000-0000-0000-000000000002', '66666666-6666-6666-6666-666666666666', 'Store B'),
  ('aaaaaaaa-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'Store C legacy');

CREATE OR REPLACE FUNCTION public.t_assert(p_cond boolean, p_msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_cond IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERT FAILED: %', p_msg; END IF;
END $$;

-- New order + open sale-fee obligation (fee_due_minor, all outstanding).
CREATE OR REPLACE FUNCTION public.t_obligation(p_store uuid, p_due bigint, p_created timestamptz DEFAULT now(),
                                               p_status text DEFAULT 'preparing')
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_order uuid; v_ob uuid;
BEGIN
  INSERT INTO public.store_orders(order_no, store_id, order_status, created_at)
  VALUES ('T-' || substr(md5(random()::text), 1, 8), p_store, p_status, p_created) RETURNING id INTO v_order;
  INSERT INTO public.store_sale_fee_obligations(store_id, order_id, confirmed_revenue_php, fee_due_minor, fee_paid_minor,
    fee_outstanding_minor, status, idempotency_key, created_at, original_fee_due_minor)
  VALUES (p_store, v_order, p_due / 100, p_due, 0, p_due, 'open', 'ob:' || v_order::text, p_created, p_due)
  RETURNING id INTO v_ob;
  RETURN v_ob;
END $$;

-- Pre-FIN-04 style charge request row (direct insert, as the old TS writer did).
CREATE OR REPLACE FUNCTION public.t_legacy_request(p_store uuid, p_amount bigint, p_status text DEFAULT 'PENDING')
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v uuid;
BEGIN
  INSERT INTO public.business_cash_charge_requests(store_id, owner_user_id, amount_minor, status, idempotency_key)
  SELECT p_store, s.owner_user_id, p_amount, p_status, 'legacy:' || gen_random_uuid()::text
    FROM public.stores s WHERE s.id = p_store
  RETURNING id INTO v;
  RETURN v;
END $$;

CREATE OR REPLACE FUNCTION public.t_ledger_sum(p_store uuid) RETURNS bigint LANGUAGE sql AS $$
  SELECT coalesce(sum(CASE WHEN direction = 'credit' THEN amount_minor ELSE -amount_minor END), 0)::bigint
    FROM public.business_cash_ledger WHERE store_id = p_store
$$;
