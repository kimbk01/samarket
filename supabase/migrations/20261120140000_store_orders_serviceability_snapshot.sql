-- Delivery serviceability snapshot on store_orders (order-time immutable evidence).
-- Distance eligibility uses haversine only; Google Routes remains ETA-only.

ALTER TABLE public.store_orders
  ADD COLUMN IF NOT EXISTS checkout_store_latitude double precision,
  ADD COLUMN IF NOT EXISTS checkout_store_longitude double precision,
  ADD COLUMN IF NOT EXISTS checkout_serviceability_eligible boolean,
  ADD COLUMN IF NOT EXISTS checkout_serviceability_max_km double precision,
  ADD COLUMN IF NOT EXISTS checkout_serviceability_reason text;

COMMENT ON COLUMN public.store_orders.checkout_store_latitude IS
  'Immutable order-time snapshot of store lat used for serviceability.';
COMMENT ON COLUMN public.store_orders.checkout_store_longitude IS
  'Immutable order-time snapshot of store lng used for serviceability.';
COMMENT ON COLUMN public.store_orders.checkout_serviceability_eligible IS
  'Order-time delivery distance eligibility (true/false). Null when not evaluated.';
COMMENT ON COLUMN public.store_orders.checkout_serviceability_max_km IS
  'Effective max km at order time (null = no max / policy off).';
COMMENT ON COLUMN public.store_orders.checkout_serviceability_reason IS
  'evaluateDeliveryServiceability reason code at order time.';
