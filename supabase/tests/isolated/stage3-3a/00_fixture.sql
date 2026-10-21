-- Isolated fixture for stage 3-A (LOC-005 stores delivery geo guard, LOC-006 atomic service-area replace).
-- NOT for Supabase projects. Runs on a throwaway local PostgreSQL 16 database only.
-- Runner: supabase/tests/isolated/stage3-3a/run.sh <pg_host> <pg_port>
-- Column definitions / constraints copied from production information_schema + pg_constraint (read-only, 2026-10-21),
-- trimmed to the columns the code under test touches. Triggers mirrored: stores_updated_at (set_updated_at),
-- trg_stores_block_client_role_writes (block_client_role_direct_writes, prod body byte-identical - md5 checked).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END $$;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
-- Supabase service_role bypasses RLS (as in production).
ALTER ROLE service_role BYPASSRLS;

CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public' AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;

CREATE OR REPLACE FUNCTION public.block_client_role_direct_writes()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    RAISE EXCEPTION 'client_role_direct_write_forbidden:%', TG_TABLE_NAME
      USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TABLE public.stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL,
  store_name text NOT NULL DEFAULT 'store',
  phone text,
  lat double precision,
  lng double precision,
  delivery_available boolean NOT NULL DEFAULT false,
  pickup_available boolean NOT NULL DEFAULT true,
  delivery_service_area_authority text NOT NULL DEFAULT 'legacy_radius',
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stores_delivery_service_area_authority_check
    CHECK (delivery_service_area_authority = ANY (ARRAY['legacy_radius'::text, 'v2_lgu'::text]))
);
CREATE TRIGGER stores_updated_at BEFORE UPDATE ON public.stores
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_stores_block_client_role_writes BEFORE INSERT OR DELETE OR UPDATE ON public.stores
  FOR EACH ROW EXECUTE FUNCTION public.block_client_role_direct_writes();
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stores TO service_role, authenticated;

CREATE TABLE public.store_delivery_service_areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  geo_identity text NOT NULL,
  area_type text NOT NULL DEFAULT 'city_municipality'::text,
  display_name_snapshot text,
  source text NOT NULL DEFAULT 'owner'::text,
  is_store_home boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT store_delivery_service_areas_area_type_check CHECK ((area_type = 'city_municipality'::text)),
  CONSTRAINT store_delivery_service_areas_source_check
    CHECK ((source = ANY (ARRAY['owner'::text, 'admin'::text, 'migration_proposal'::text]))),
  CONSTRAINT store_delivery_service_areas_store_geo_unique UNIQUE (store_id, geo_identity)
);
CREATE INDEX store_delivery_service_areas_store_id_idx ON public.store_delivery_service_areas USING btree (store_id);
ALTER TABLE public.store_delivery_service_areas ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_delivery_service_areas TO service_role;

-- Seed: production-like states.
-- S1 = delivery ON + NULL coords (one of the 9 legacy rows, D-5: must stay editable for unrelated columns).
-- S2 = delivery OFF + coords. S3 = V2 store with 2 saved areas.
INSERT INTO public.stores (id, owner_user_id, store_name, lat, lng, delivery_available) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 's1-null-geo', NULL, NULL, true),
  ('aaaaaaaa-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 's2-geo', 14.55, 121.02, false),
  ('aaaaaaaa-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 's3-v2', 14.60, 121.03, true);
INSERT INTO public.store_delivery_service_areas (store_id, geo_identity, display_name_snapshot, source, is_store_home, updated_at)
VALUES
  ('aaaaaaaa-0000-0000-0000-000000000003', 'lgu-a', 'A City', 'owner', true, '2026-10-01 00:00:00+00'),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'lgu-b', 'B City', 'owner', false, '2026-10-01 00:00:00+00');
