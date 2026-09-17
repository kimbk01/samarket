-- DELIVERY SERVICE AREA V2 — Owner regional LGU authority (store-by-store cutover)
-- Default authority remains legacy hard-radius. V2 activates only when explicitly set.

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS delivery_service_area_authority text NOT NULL DEFAULT 'legacy_radius';

ALTER TABLE public.stores
  DROP CONSTRAINT IF EXISTS stores_delivery_service_area_authority_check;

ALTER TABLE public.stores
  ADD CONSTRAINT stores_delivery_service_area_authority_check
  CHECK (delivery_service_area_authority IN ('legacy_radius', 'v2_lgu'));

COMMENT ON COLUMN public.stores.delivery_service_area_authority IS
  'V2 cutover: legacy_radius = hard haversine via delivery_radius_km; v2_lgu = Owner-selected LGUs are final eligibility. Default legacy_radius preserves Production coverage.';

-- Owner/Admin confirmed delivery LGUs (PSGC / national LGU id). Not authoritative until store is v2_lgu.
CREATE TABLE IF NOT EXISTS public.store_delivery_service_areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  geo_identity text NOT NULL,
  area_type text NOT NULL DEFAULT 'city_municipality',
  display_name_snapshot text,
  source text NOT NULL DEFAULT 'owner',
  is_store_home boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT store_delivery_service_areas_area_type_check
    CHECK (area_type IN ('city_municipality')),
  CONSTRAINT store_delivery_service_areas_source_check
    CHECK (source IN ('owner', 'admin', 'migration_proposal')),
  CONSTRAINT store_delivery_service_areas_store_geo_unique
    UNIQUE (store_id, geo_identity)
);

CREATE INDEX IF NOT EXISTS store_delivery_service_areas_store_id_idx
  ON public.store_delivery_service_areas (store_id);

COMMENT ON TABLE public.store_delivery_service_areas IS
  'Normalized Owner/Admin selected delivery LGUs. Customer-authoritative only when stores.delivery_service_area_authority = v2_lgu.';

-- Member address canonical geographic identity (shared PSGC/LGU). Address SSOT stays user_addresses.
ALTER TABLE public.user_addresses
  ADD COLUMN IF NOT EXISTS canonical_lgu_id text;

COMMENT ON COLUMN public.user_addresses.canonical_lgu_id IS
  'Platform national LGU (PSGC) id when safely resolved from structured city/province. Null when unresolved — do not guess.';
