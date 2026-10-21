-- Isolated fixture for stage 3-B (OPS-07 first_listed_at trigger, OPS-01 store_notices table/RLS).
-- NOT for Supabase projects. Runs on a throwaway local PostgreSQL 16 database only.
-- Runner: supabase/tests/isolated/stage3-3b/run.sh <pg_host> <pg_port>
-- stores trimmed to the columns the trigger / RLS policy touch (prod information_schema, read-only 2026-10-21).
-- Roles mirror Supabase: anon / authenticated / service_role (BYPASSRLS); the tests switch with SET ROLE.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- Supabase default privileges: new public tables are granted ALL to anon/authenticated/service_role.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

CREATE TABLE public.stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL DEFAULT gen_random_uuid(),
  store_name text NOT NULL DEFAULT 'store',
  approval_status text NOT NULL DEFAULT 'pending',
  is_visible boolean NOT NULL DEFAULT false,
  first_listed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.stores FROM anon, authenticated;
-- Prod (read-only 2026-10-21): anon has no SELECT on stores; authenticated has SELECT (RLS: approved+visible / own).
GRANT SELECT ON public.stores TO authenticated;
