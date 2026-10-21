-- Isolated fixture for stage 3-E (PRD-11 reorder RPC / PRD-15 client_request_id).
-- NOT for Supabase projects. Runs on a throwaway local PostgreSQL 16 database only.
-- Runner: supabase/tests/isolated/stage3-3e/run.sh <pg_host> <pg_port>
-- store_menu_sections copied from production information_schema / pg_constraint / pg_indexes / triggers
-- (read-only, 2026-10-21). store_products trimmed to the columns the migration and tests touch
-- (menu_section_id FK ON DELETE SET NULL as in production).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END $$;
ALTER ROLE service_role BYPASSRLS; -- as on Supabase
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

CREATE TABLE public.stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL
);

CREATE TABLE public.store_menu_sections (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  description text,
  is_hidden boolean NOT NULL DEFAULT false,
  CONSTRAINT store_menu_sections_pkey PRIMARY KEY (id),
  CONSTRAINT store_menu_sections_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE,
  CONSTRAINT store_menu_sections_store_id_name_key UNIQUE (store_id, name)
);
CREATE INDEX idx_store_menu_sections_store_sort ON public.store_menu_sections USING btree (store_id, sort_order);
CREATE TRIGGER store_menu_sections_updated_at BEFORE UPDATE ON public.store_menu_sections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
ALTER TABLE public.store_menu_sections ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.store_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id),
  title text NOT NULL,
  product_status text NOT NULL DEFAULT 'hidden',
  menu_section_id uuid REFERENCES public.store_menu_sections(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;

INSERT INTO public.stores (id, owner_user_id) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111'),
  ('aaaaaaaa-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222');

INSERT INTO public.store_menu_sections (id, store_id, name, sort_order) VALUES
  ('5ec00000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'A', 0),
  ('5ec00000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'B', 1),
  ('5ec00000-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'C', 2),
  ('5ec00000-0000-0000-0000-000000000009', 'aaaaaaaa-0000-0000-0000-000000000002', 'Other', 0);

-- legacy product rows (created before the migration) - must keep client_request_id NULL (D-5: no backfill)
INSERT INTO public.store_products (store_id, title, product_status, menu_section_id) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'legacy-1', 'active', '5ec00000-0000-0000-0000-000000000001'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'legacy-2', 'active', '5ec00000-0000-0000-0000-000000000001');
