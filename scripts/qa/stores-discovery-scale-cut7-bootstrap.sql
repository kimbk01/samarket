-- CUT 7 — Minimal stores bootstrap for isolated local benchmark DB.
-- NOT production. Disposable.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  store_name text,
  district text,
  lat double precision,
  lng double precision,
  rating_avg numeric,
  review_count integer NOT NULL DEFAULT 0,
  delivery_available boolean,
  approval_status text NOT NULL DEFAULT 'approved',
  is_visible boolean NOT NULL DEFAULT true,
  store_category_id uuid,
  store_topic_id uuid,
  business_type text
);

CREATE INDEX IF NOT EXISTS idx_cut7_stores_slug ON public.stores (slug);

-- Stub for CUT3 REVOKE (ledger created in CUT2; not required for wave planner)
CREATE TABLE IF NOT EXISTS public.store_order_popularity_ledger (
  order_id uuid PRIMARY KEY,
  store_id uuid NOT NULL,
  order_created_at timestamptz NOT NULL
);
