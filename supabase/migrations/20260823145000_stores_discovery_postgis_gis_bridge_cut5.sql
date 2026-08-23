-- CUT 5 — PostGIS (gis schema) + pg_trgm bridge for discovery projections.
-- This DB installs PostGIS in schema `gis`, not `public`. Discovery functions must
-- resolve geography/ST_* via search_path including gis. Additive only.

BEGIN;

CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA gis;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

-- Help session/regproc checks resolve postgis_version without schema qualifier.
CREATE OR REPLACE FUNCTION public.postgis_version()
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public, gis, extensions
AS $$
  SELECT gis.postgis_version();
$$;

REVOKE ALL ON FUNCTION public.postgis_version() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.postgis_version() TO service_role, postgres;

COMMIT;
