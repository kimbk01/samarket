-- X-4 isolated fixture (local throwaway PostgreSQL 16 only). Minimal shapes of the production objects the
-- X-4 functions read/write (columns verified present in production 2026-10-21 by read-only catalog query).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
-- Supabase default: new functions executable by anon/authenticated unless revoked.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;

CREATE TABLE public.profiles (id uuid PRIMARY KEY, role text);
CREATE OR REPLACE FUNCTION public.is_platform_admin(p uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = p AND role IN ('admin','super_admin')) $$;
CREATE TABLE public.store_orders (id uuid PRIMARY KEY, order_status text, updated_at timestamptz DEFAULT now(), needs_admin_attention boolean DEFAULT false);
CREATE TABLE public.store_order_deliveries (order_id uuid PRIMARY KEY, delivery_status text, updated_at timestamptz DEFAULT now());
CREATE TABLE public.store_settlements (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), settlement_status text, created_at timestamptz DEFAULT now());
CREATE TABLE public.delivery_operation_alert_events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid, event_status text, resolved_at timestamptz, resolved_by uuid);
CREATE TABLE public.delivery_operation_alert_actions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), action_status text, executed_at timestamptz DEFAULT now(), retry_count int, max_retries int);
CREATE TABLE public.delivery_auto_actions_runtime_settings (singleton int PRIMARY KEY, delivery_auto_actions_enabled boolean);
CREATE TABLE public.calls (fn text, at timestamptz DEFAULT now());
CREATE OR REPLACE FUNCTION public.scan_store_order_sla_warnings() RETURNS void LANGUAGE sql AS $$ INSERT INTO public.calls(fn) VALUES ('scan') $$;
CREATE OR REPLACE FUNCTION public.sync_delivery_operation_alert_events() RETURNS void LANGUAGE sql AS $$ INSERT INTO public.calls(fn) VALUES ('sync') $$;
CREATE OR REPLACE FUNCTION public.run_delivery_operation_alert_auto_actions() RETURNS void LANGUAGE sql AS $$ INSERT INTO public.calls(fn) VALUES ('run') $$;
CREATE OR REPLACE FUNCTION public.retry_delivery_alert_auto_action(a uuid, b uuid) RETURNS void LANGUAGE sql AS $$ INSERT INTO public.calls(fn) VALUES ('retry') $$;
CREATE TABLE public.store_coupon_campaigns (id uuid PRIMARY KEY, reserved_spend_php numeric DEFAULT 0, updated_at timestamptz DEFAULT now());
CREATE TABLE public.coupon_user_entitlements (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), campaign_id uuid, status text, reserved_php numeric, updated_at timestamptz DEFAULT now());
CREATE TABLE public.coupon_audit_events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), campaign_id uuid, entitlement_id uuid, actor_user_id uuid, action text, payload jsonb, created_at timestamptz DEFAULT now());
