-- CUT 1 — STORE DELIVERY RADIUS SSOT
-- Canonical: stores.delivery_radius_km
-- DEFAULT (application): NULL → effective 10 km (not persisted).
-- T2 seed: existing delivery_available stores get 60 (current Production effective).

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS delivery_radius_km double precision;

COMMENT ON COLUMN public.stores.delivery_radius_km IS
  'CUT1 store delivery radius SSOT (km). NULL = product default 10km via resolveEffectiveStoreDeliveryRadiusKm. Owner/Admin same writers.';

ALTER TABLE public.stores
  DROP CONSTRAINT IF EXISTS stores_delivery_radius_km_positive;

ALTER TABLE public.stores
  ADD CONSTRAINT stores_delivery_radius_km_positive
  CHECK (delivery_radius_km IS NULL OR delivery_radius_km > 0);

-- T2: seed ONLY delivery-available stores that still lack an explicit radius.
-- Deterministic: delivery_available = true AND delivery_radius_km IS NULL.
-- Non-delivery stores remain NULL → effective 10 when they later enable delivery.
UPDATE public.stores
SET delivery_radius_km = 60
WHERE delivery_available IS TRUE
  AND delivery_radius_km IS NULL;
