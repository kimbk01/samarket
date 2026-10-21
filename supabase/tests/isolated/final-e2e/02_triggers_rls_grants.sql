-- Production triggers (pg_get_triggerdef), RLS flags + policies (pg_policies), table privileges (has_table_privilege
-- for anon/authenticated/service_role) and function ACLs (pg_proc.proacl) - read-only copy 2026-10-21.
-- Loaded after 01_prod_functions.sql.

-- ------------------------------------------------------------------------------------------------ triggers
CREATE TRIGGER business_cash_ledger_no_update BEFORE DELETE OR UPDATE ON public.business_cash_ledger FOR EACH ROW EXECUTE FUNCTION business_cash_ledger_forbid_mutate();
CREATE TRIGGER trg_gift_certificate_products_updated_at BEFORE UPDATE ON public.gift_certificate_products FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_gift_certificate_revenue_ledger_block_client_role_writes BEFORE INSERT OR DELETE OR UPDATE ON public.gift_certificate_revenue_ledger FOR EACH ROW EXECUTE FUNCTION block_client_role_direct_writes();
CREATE TRIGGER trg_store_economic_point_accounts_block_client_role_writes BEFORE INSERT OR DELETE OR UPDATE ON public.store_economic_point_accounts FOR EACH ROW EXECUTE FUNCTION block_client_role_direct_writes();
CREATE TRIGGER store_economic_point_ledger_no_update BEFORE DELETE OR UPDATE ON public.store_economic_point_ledger FOR EACH ROW EXECUTE FUNCTION store_economic_point_ledger_forbid_mutate();
CREATE TRIGGER trg_store_economic_point_ledger_block_client_role_writes BEFORE INSERT OR DELETE OR UPDATE ON public.store_economic_point_ledger FOR EACH ROW EXECUTE FUNCTION block_client_role_direct_writes();
CREATE TRIGGER trg_store_fee_policies_updated_at BEFORE UPDATE ON public.store_fee_policies FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER store_menu_sections_updated_at BEFORE UPDATE ON public.store_menu_sections FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_store_order_deliveries_pickup_requires_dispatch BEFORE UPDATE OF delivery_status ON public.store_order_deliveries FOR EACH ROW EXECUTE FUNCTION store_order_deliveries_pickup_requires_dispatch();
CREATE TRIGGER trg_store_order_deliveries_updated_at BEFORE UPDATE ON public.store_order_deliveries FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER store_orders_updated_at BEFORE UPDATE ON public.store_orders FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_store_orders_cash_order_gate BEFORE INSERT ON public.store_orders FOR EACH ROW EXECUTE FUNCTION store_orders_enforce_cash_order_gate();
CREATE TRIGGER trg_store_orders_commission_lifecycle AFTER INSERT OR UPDATE OF order_status ON public.store_orders FOR EACH ROW EXECUTE FUNCTION store_orders_commission_lifecycle();
CREATE TRIGGER trg_store_orders_gift_revenue_recognition AFTER INSERT OR UPDATE OF order_status ON public.store_orders FOR EACH ROW EXECUTE FUNCTION trg_store_orders_gift_revenue_on_completed();
CREATE TRIGGER store_products_updated_at BEFORE UPDATE ON public.store_products FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_store_products_block_client_role_writes BEFORE INSERT OR DELETE OR UPDATE ON public.store_products FOR EACH ROW EXECUTE FUNCTION block_client_role_direct_writes();
CREATE TRIGGER store_sales_permissions_updated_at BEFORE UPDATE ON public.store_sales_permissions FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_store_settlements_block_client_role_writes BEFORE INSERT OR DELETE OR UPDATE ON public.store_settlements FOR EACH ROW EXECUTE FUNCTION block_client_role_direct_writes();
CREATE TRIGGER trg_store_settlements_block_paid_when_coin_recognized BEFORE INSERT OR UPDATE OF settlement_status ON public.store_settlements FOR EACH ROW EXECUTE FUNCTION store_settlements_block_paid_when_coin_recognized();
CREATE TRIGGER stores_ensure_sales_perm AFTER INSERT ON public.stores FOR EACH ROW EXECUTE FUNCTION ensure_store_sales_permission_row();
CREATE TRIGGER stores_updated_at BEFORE UPDATE ON public.stores FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_stores_block_client_role_writes BEFORE INSERT OR DELETE OR UPDATE ON public.stores FOR EACH ROW EXECUTE FUNCTION block_client_role_direct_writes();
CREATE TRIGGER trg_stores_first_listed_at BEFORE UPDATE OF is_visible, first_listed_at ON public.stores FOR EACH ROW EXECUTE FUNCTION stores_protect_first_listed_at();
CREATE TRIGGER trg_stores_guard_delivery_requires_geo BEFORE INSERT OR UPDATE OF delivery_available, lat, lng ON public.stores FOR EACH ROW EXECUTE FUNCTION stores_guard_delivery_requires_geo();

-- ------------------------------------------------------------------------------------------------ RLS (all ON in prod, none FORCE)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['admin_notification_outbox','business_cash_accounts','business_cash_ledger','coupon_user_entitlements',
    'gift_certificate_instances','gift_certificate_ledger','gift_certificate_products','gift_certificate_redemptions',
    'gift_certificate_revenue_ledger','gift_promo_ledger','gift_promo_obligations','store_coupon_campaigns','store_coupon_redemptions',
    'store_economic_point_accounts','store_economic_point_ledger','store_fee_policies','store_menu_sections',
    'store_order_cancel_requests','store_order_deliveries','store_order_events','store_order_item_options','store_order_items',
    'store_orders','store_payments','store_products','store_sale_fee_obligations','store_sales_permissions','store_settlements','stores']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

CREATE POLICY business_cash_accounts_owner_select ON public.business_cash_accounts AS PERMISSIVE FOR SELECT TO authenticated
  USING (EXISTS ( SELECT 1 FROM stores s WHERE ((s.id = business_cash_accounts.store_id) AND (s.owner_user_id = auth.uid()))));
CREATE POLICY business_cash_ledger_owner_select ON public.business_cash_ledger AS PERMISSIVE FOR SELECT TO authenticated
  USING (EXISTS ( SELECT 1 FROM stores s WHERE ((s.id = business_cash_ledger.store_id) AND (s.owner_user_id = auth.uid()))));
CREATE POLICY coupon_user_entitlements_select_own ON public.coupon_user_entitlements AS PERMISSIVE FOR SELECT TO public
  USING (buyer_user_id = auth.uid());
CREATE POLICY gift_certificate_instances_select ON public.gift_certificate_instances AS PERMISSIVE FOR SELECT TO authenticated
  USING ((current_owner_user_id = auth.uid()) OR (purchaser_user_id = auth.uid()) OR internal.is_platform_admin(auth.uid()) OR (EXISTS ( SELECT 1 FROM stores s WHERE ((s.id = gift_certificate_instances.store_id) AND (s.owner_user_id = auth.uid())))));
CREATE POLICY gift_certificate_ledger_select ON public.gift_certificate_ledger AS PERMISSIVE FOR SELECT TO authenticated
  USING ((user_id = auth.uid()) OR internal.is_platform_admin(auth.uid()) OR ((store_id IS NOT NULL) AND (EXISTS ( SELECT 1 FROM stores s WHERE ((s.id = gift_certificate_ledger.store_id) AND (s.owner_user_id = auth.uid()))))));
CREATE POLICY gift_certificate_products_select_active ON public.gift_certificate_products AS PERMISSIVE FOR SELECT TO authenticated
  USING (((active = true) AND ((sales_starts_at IS NULL) OR (sales_starts_at <= now())) AND ((sales_ends_at IS NULL) OR (sales_ends_at >= now()))) OR internal.is_platform_admin(auth.uid()) OR (EXISTS ( SELECT 1 FROM stores s WHERE ((s.id = gift_certificate_products.store_id) AND (s.owner_user_id = auth.uid())))));
CREATE POLICY gift_certificate_redemptions_select ON public.gift_certificate_redemptions AS PERMISSIVE FOR SELECT TO authenticated
  USING ((buyer_user_id = auth.uid()) OR internal.is_platform_admin(auth.uid()) OR (EXISTS ( SELECT 1 FROM stores s WHERE ((s.id = gift_certificate_redemptions.store_id) AND (s.owner_user_id = auth.uid())))));
CREATE POLICY gift_certificate_revenue_ledger_select ON public.gift_certificate_revenue_ledger AS PERMISSIVE FOR SELECT TO authenticated
  USING (internal.is_platform_admin(auth.uid()) OR (EXISTS ( SELECT 1 FROM stores s WHERE ((s.id = gift_certificate_revenue_ledger.store_id) AND (s.owner_user_id = auth.uid())))));
CREATE POLICY gift_promo_ledger_select ON public.gift_promo_ledger AS PERMISSIVE FOR SELECT TO authenticated
  USING (internal.is_platform_admin(auth.uid()) OR (EXISTS ( SELECT 1 FROM stores s WHERE ((s.id = gift_promo_ledger.store_id) AND (s.owner_user_id = auth.uid())))));
CREATE POLICY gift_promo_obligations_select ON public.gift_promo_obligations AS PERMISSIVE FOR SELECT TO authenticated
  USING (internal.is_platform_admin(auth.uid()) OR (EXISTS ( SELECT 1 FROM stores s WHERE ((s.id = gift_promo_obligations.store_id) AND (s.owner_user_id = auth.uid())))));
CREATE POLICY store_economic_point_accounts_owner_select ON public.store_economic_point_accounts AS PERMISSIVE FOR SELECT TO authenticated
  USING (EXISTS ( SELECT 1 FROM stores s WHERE ((s.id = store_economic_point_accounts.store_id) AND (s.owner_user_id = auth.uid()))));
CREATE POLICY store_economic_point_ledger_owner_select ON public.store_economic_point_ledger AS PERMISSIVE FOR SELECT TO authenticated
  USING (EXISTS ( SELECT 1 FROM stores s WHERE ((s.id = store_economic_point_ledger.store_id) AND (s.owner_user_id = auth.uid()))));
CREATE POLICY store_menu_sections_delete_owner ON public.store_menu_sections AS PERMISSIVE FOR DELETE TO public
  USING (internal.is_admin_user() OR (EXISTS ( SELECT 1 FROM stores s WHERE ((s.id = store_menu_sections.store_id) AND (s.owner_user_id = auth.uid())))));
CREATE POLICY store_menu_sections_insert_owner ON public.store_menu_sections AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (internal.is_admin_user() OR (EXISTS ( SELECT 1 FROM stores s WHERE ((s.id = store_menu_sections.store_id) AND (s.owner_user_id = auth.uid())))));
CREATE POLICY store_menu_sections_select ON public.store_menu_sections AS PERMISSIVE FOR SELECT TO public
  USING (internal.is_admin_user() OR (EXISTS ( SELECT 1 FROM stores s WHERE ((s.id = store_menu_sections.store_id) AND (((s.approval_status = 'approved'::text) AND (s.is_visible = true)) OR (s.owner_user_id = auth.uid()))))));
CREATE POLICY store_menu_sections_update_owner ON public.store_menu_sections AS PERMISSIVE FOR UPDATE TO public
  USING (internal.is_admin_user() OR (EXISTS ( SELECT 1 FROM stores s WHERE ((s.id = store_menu_sections.store_id) AND (s.owner_user_id = auth.uid())))))
  WITH CHECK (internal.is_admin_user() OR (EXISTS ( SELECT 1 FROM stores s WHERE ((s.id = store_menu_sections.store_id) AND (s.owner_user_id = auth.uid())))));
CREATE POLICY store_order_deliveries_admin_delete ON public.store_order_deliveries AS PERMISSIVE FOR DELETE TO authenticated
  USING (internal.is_platform_admin(auth.uid()));
CREATE POLICY store_order_deliveries_admin_insert ON public.store_order_deliveries AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (internal.is_platform_admin(auth.uid()));
CREATE POLICY store_order_deliveries_admin_select ON public.store_order_deliveries AS PERMISSIVE FOR SELECT TO authenticated
  USING (internal.is_platform_admin(auth.uid()));
CREATE POLICY store_order_deliveries_admin_update ON public.store_order_deliveries AS PERMISSIVE FOR UPDATE TO authenticated
  USING (internal.is_platform_admin(auth.uid())) WITH CHECK (internal.is_platform_admin(auth.uid()));
CREATE POLICY store_order_deliveries_buyer_select ON public.store_order_deliveries AS PERMISSIVE FOR SELECT TO authenticated
  USING (buyer_user_id = auth.uid());
CREATE POLICY store_order_deliveries_owner_select ON public.store_order_deliveries AS PERMISSIVE FOR SELECT TO authenticated
  USING (EXISTS ( SELECT 1 FROM stores s WHERE ((s.id = store_order_deliveries.store_id) AND (s.owner_user_id = auth.uid()))));
CREATE POLICY store_order_deliveries_rider_select ON public.store_order_deliveries AS PERMISSIVE FOR SELECT TO authenticated
  USING ((rider_id IS NOT NULL) AND (EXISTS ( SELECT 1 FROM delivery_riders dr WHERE ((dr.id = store_order_deliveries.rider_id) AND (dr.user_id = auth.uid())))));
CREATE POLICY store_order_events_no_delete_authenticated ON public.store_order_events AS PERMISSIVE FOR DELETE TO authenticated USING (false);
CREATE POLICY store_order_events_no_insert_authenticated ON public.store_order_events AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY store_order_events_no_update_authenticated ON public.store_order_events AS PERMISSIVE FOR UPDATE TO authenticated USING (false);
CREATE POLICY store_order_events_select_buyer ON public.store_order_events AS PERMISSIVE FOR SELECT TO authenticated
  USING (EXISTS ( SELECT 1 FROM store_orders so WHERE ((so.id = store_order_events.order_id) AND (so.buyer_user_id = auth.uid()))));
CREATE POLICY store_order_events_select_owner ON public.store_order_events AS PERMISSIVE FOR SELECT TO authenticated
  USING (EXISTS ( SELECT 1 FROM stores st WHERE ((st.id = store_order_events.store_id) AND (st.owner_user_id = auth.uid()))));
CREATE POLICY store_order_items_related_select ON public.store_order_items AS PERMISSIVE FOR SELECT TO public
  USING (EXISTS ( SELECT 1 FROM store_orders o WHERE ((o.id = store_order_items.order_id) AND ((o.buyer_user_id = auth.uid()) OR (EXISTS ( SELECT 1 FROM stores s WHERE ((s.id = o.store_id) AND (s.owner_user_id = auth.uid()))))))));
CREATE POLICY store_orders_buyer_select ON public.store_orders AS PERMISSIVE FOR SELECT TO public
  USING (buyer_user_id = auth.uid());
CREATE POLICY store_orders_owner_select ON public.store_orders AS PERMISSIVE FOR SELECT TO public
  USING (EXISTS ( SELECT 1 FROM stores s WHERE ((s.id = store_orders.store_id) AND (s.owner_user_id = auth.uid()))));
CREATE POLICY store_products_owner_all ON public.store_products AS PERMISSIVE FOR ALL TO public
  USING (internal.is_admin_user() OR (EXISTS ( SELECT 1 FROM stores s WHERE ((s.id = store_products.store_id) AND (s.owner_user_id = auth.uid())))))
  WITH CHECK (internal.is_admin_user() OR (EXISTS ( SELECT 1 FROM stores s WHERE ((s.id = store_products.store_id) AND (s.owner_user_id = auth.uid())))));
CREATE POLICY store_products_public_active ON public.store_products AS PERMISSIVE FOR SELECT TO public
  USING ((product_status = 'active'::text) AND (EXISTS ( SELECT 1 FROM stores s WHERE ((s.id = store_products.store_id) AND (s.approval_status = 'approved'::text) AND (s.is_visible = true)))) AND (EXISTS ( SELECT 1 FROM store_sales_permissions p WHERE ((p.store_id = store_products.store_id) AND (p.allowed_to_sell = true) AND (p.sales_status = 'approved'::text)))));
CREATE POLICY store_sale_fee_obligations_owner_select ON public.store_sale_fee_obligations AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1 FROM stores s WHERE ((s.id = store_sale_fee_obligations.store_id) AND (s.owner_user_id = auth.uid())))) OR internal.is_platform_admin(auth.uid()));
CREATE POLICY store_sales_perm_admin_write ON public.store_sales_permissions AS PERMISSIVE FOR ALL TO public
  USING (internal.is_admin_user()) WITH CHECK (internal.is_admin_user());
CREATE POLICY store_sales_perm_select ON public.store_sales_permissions AS PERMISSIVE FOR SELECT TO public
  USING (internal.is_admin_user() OR (EXISTS ( SELECT 1 FROM stores s WHERE ((s.id = store_sales_permissions.store_id) AND (s.owner_user_id = auth.uid())))));
CREATE POLICY stores_admin_select ON public.stores AS PERMISSIVE FOR SELECT TO authenticated
  USING (internal.is_platform_admin(auth.uid()));
CREATE POLICY stores_insert_owner ON public.stores AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (owner_user_id = auth.uid());
CREATE POLICY stores_public_read_approved ON public.stores AS PERMISSIVE FOR SELECT TO public
  USING (((approval_status = 'approved'::text) AND (is_visible = true)) OR (owner_user_id = auth.uid()) OR internal.is_admin_user());
CREATE POLICY stores_update_owner_or_admin ON public.stores AS PERMISSIVE FOR UPDATE TO public
  USING ((owner_user_id = auth.uid()) OR internal.is_admin_user());

-- ------------------------------------------------------------------------------------------------ table privileges
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated, service_role;
DO $$
DECLARE t text;
BEGIN
  -- full DML for anon/authenticated/service_role in prod
  FOREACH t IN ARRAY ARRAY['coupon_user_entitlements','gift_certificate_instances','gift_certificate_ledger','gift_certificate_products',
    'gift_certificate_redemptions','gift_promo_ledger','gift_promo_obligations','store_coupon_campaigns','store_coupon_redemptions',
    'store_fee_policies','store_menu_sections','store_order_cancel_requests','store_order_deliveries','store_order_events',
    'store_order_item_options','store_order_items','store_orders','store_payments','store_sales_permissions']
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.%I TO anon, authenticated, service_role', t);
  END LOOP;
  -- read-only (SELECT, REFERENCES, TRIGGER) for all three roles in prod
  FOREACH t IN ARRAY ARRAY['business_cash_accounts','business_cash_ledger','gift_certificate_revenue_ledger',
    'store_economic_point_accounts','store_economic_point_ledger','store_sale_fee_obligations','store_settlements']
  LOOP
    EXECUTE format('GRANT SELECT, REFERENCES, TRIGGER ON public.%I TO anon, authenticated, service_role', t);
  END LOOP;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.admin_notification_outbox TO service_role;
GRANT REFERENCES, TRIGGER ON public.store_products, public.stores TO anon;
GRANT SELECT, REFERENCES, TRIGGER ON public.store_products, public.stores TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.store_products, public.stores TO service_role;
-- support table read by the rider SELECT policy (not under test)
GRANT SELECT ON public.delivery_riders TO authenticated;

-- ------------------------------------------------------------------------------------------------ function ACLs (prod proacl)
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION
  public.admin_notification_backoff(integer),
  public.admin_notification_outbox_enqueue(text, text, jsonb, text),
  public.create_store_order_atomic(uuid, uuid, text, jsonb, jsonb),
  public.ensure_business_cash_account(uuid),
  public.ensure_store_economic_point_account(uuid),
  public.gift_certificate_cancel_order_restore(uuid),
  public.gift_certificate_instance_allows_checkout_store(text, uuid, uuid),
  public.gift_certificate_instance_is_expired(date),
  public.gift_certificate_issue_date(timestamptz),
  public.gift_certificate_promo_reverse_for_redemption(uuid),
  public.gift_certificate_refund_order_atomic(uuid, uuid),
  public.restore_store_coupon_entitlement(uuid, boolean),
  public.reverse_coin_credits_for_order(uuid, text, text),
  public.store_charged_delivery_fee_php(jsonb, numeric, text),
  public.store_commission_notify_admin(text, text, text, text, text, text, text, text),
  public.store_commission_php_text(bigint),
  public.store_commission_resolve_policy(uuid),
  public.store_front_commerce_open(jsonb, boolean, timestamptz),
  public.store_front_day_intervals(jsonb, text[], text, integer, integer, integer),
  public.store_front_hhmm_to_minutes(text),
  public.store_order_buyer_cancel_request_atomic(uuid, uuid, text, text),
  public.store_order_cancel_direct_atomic(uuid, text, text, text),
  public.store_order_cancel_request_decide_atomic(uuid, uuid, uuid, text, text, text, text, text, timestamptz),
  public.store_order_owner_cancel_atomic(uuid, uuid, uuid, text, text, text),
  public.block_client_role_direct_writes(),
  public.ensure_store_sales_permission_row(),
  public.generate_gift_public_number(),
  public.gift_certificate_recognize_revenue_for_completed_order(uuid),
  public.store_cash_order_gate_mode(),
  public.store_cash_position(uuid),
  public.store_settlements_block_paid_when_coin_recognized(),
  public.stores_protect_first_listed_at(),
  public.trg_store_orders_gift_revenue_on_completed()
TO service_role;
DO $$
DECLARE f regprocedure;
BEGIN
  FOR f IN SELECT p.oid::regprocedure FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
             AND p.proname IN ('gift_certificate_redemption_is_recognized', 'gift_certificate_redemption_recognized_net')
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
  END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.business_cash_ledger_forbid_mutate(), public.set_updated_at(),
  public.store_economic_point_ledger_forbid_mutate(), public.store_order_deliveries_pickup_requires_dispatch()
  TO PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.stores_guard_delivery_requires_geo() TO anon, authenticated, service_role;
-- postgres-only in prod (no grant): gift_certificate_redemption_reverse, store_commission_charge_order_internal,
-- store_commission_debit_internal, store_commission_notify_review, store_order_apply_cancel_side_effects,
-- store_orders_commission_lifecycle, store_orders_enforce_cash_order_gate.
