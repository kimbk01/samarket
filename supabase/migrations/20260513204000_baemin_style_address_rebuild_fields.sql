-- Baemin-style address rebuild: additive canonical Places fields.
-- Existing address/order data is preserved; legacy display columns stay in use for compatibility.

ALTER TABLE public.user_addresses
  ADD COLUMN IF NOT EXISTS place_id text;

ALTER TABLE public.user_addresses
  ADD COLUMN IF NOT EXISTS formatted_address text;

ALTER TABLE public.user_addresses
  ADD COLUMN IF NOT EXISTS road_address text;

ALTER TABLE public.user_addresses
  ADD COLUMN IF NOT EXISTS detail_address text;

ALTER TABLE public.user_addresses
  ADD COLUMN IF NOT EXISTS delivery_note text;

ALTER TABLE public.user_addresses
  ADD COLUMN IF NOT EXISTS last_used_at timestamptz;

UPDATE public.user_addresses
SET formatted_address = COALESCE(formatted_address, full_address),
    detail_address = COALESCE(detail_address, unit_floor_room)
WHERE formatted_address IS NULL
   OR detail_address IS NULL;

CREATE INDEX IF NOT EXISTS user_addresses_user_active_recent_idx
  ON public.user_addresses (user_id, is_active, last_used_at DESC NULLS LAST, updated_at DESC);

CREATE INDEX IF NOT EXISTS user_addresses_user_place_id_idx
  ON public.user_addresses (user_id, place_id)
  WHERE place_id IS NOT NULL AND is_active;

COMMENT ON COLUMN public.user_addresses.place_id IS
  'Google Places place_id selected by the user. Required for new Baemin-style delivery addresses.';
COMMENT ON COLUMN public.user_addresses.formatted_address IS
  'Google Place Details formatted address snapshot.';
COMMENT ON COLUMN public.user_addresses.road_address IS
  'Road/building/search-result address line for display and search UX.';
COMMENT ON COLUMN public.user_addresses.detail_address IS
  'User-entered delivery detail such as unit, floor, entrance description.';
COMMENT ON COLUMN public.user_addresses.delivery_note IS
  'Reusable delivery request note for checkout.';
COMMENT ON COLUMN public.user_addresses.last_used_at IS
  'Recent-use sorting timestamp for delivery address selection.';

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS place_id text;

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS formatted_address text;

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS detail_address text;

UPDATE public.stores
SET formatted_address = COALESCE(
      formatted_address,
      NULLIF(
        concat_ws(' ', NULLIF(address_line1, ''), NULLIF(address_line2, ''), NULLIF(city, ''), NULLIF(region, '')),
        ''
      )
    ),
    detail_address = COALESCE(detail_address, address_line2)
WHERE formatted_address IS NULL
   OR detail_address IS NULL;

CREATE INDEX IF NOT EXISTS stores_place_id_idx
  ON public.stores (place_id)
  WHERE place_id IS NOT NULL;

COMMENT ON COLUMN public.stores.place_id IS
  'Google Places place_id for store location.';
COMMENT ON COLUMN public.stores.formatted_address IS
  'Google Place Details formatted address snapshot for store location.';
COMMENT ON COLUMN public.stores.detail_address IS
  'Store location detail address; legacy address_line2 remains for compatibility.';

ALTER TABLE public.store_orders
  ADD COLUMN IF NOT EXISTS delivery_place_id text;

ALTER TABLE public.store_orders
  ADD COLUMN IF NOT EXISTS delivery_formatted_address text;

ALTER TABLE public.store_orders
  ADD COLUMN IF NOT EXISTS delivery_detail_address text;

ALTER TABLE public.store_orders
  ADD COLUMN IF NOT EXISTS delivery_note text;

ALTER TABLE public.store_orders
  ADD COLUMN IF NOT EXISTS delivery_latitude double precision;

ALTER TABLE public.store_orders
  ADD COLUMN IF NOT EXISTS delivery_longitude double precision;

ALTER TABLE public.store_orders
  ADD COLUMN IF NOT EXISTS checkout_straight_distance_meters integer;

UPDATE public.store_orders
SET delivery_formatted_address = COALESCE(
      delivery_formatted_address,
      NULLIF(concat_ws(' ', NULLIF(delivery_address_summary, ''), NULLIF(delivery_address_detail, '')), '')
    ),
    delivery_detail_address = COALESCE(delivery_detail_address, delivery_address_detail)
WHERE delivery_formatted_address IS NULL
   OR delivery_detail_address IS NULL;

CREATE INDEX IF NOT EXISTS store_orders_delivery_place_id_idx
  ON public.store_orders (delivery_place_id)
  WHERE delivery_place_id IS NOT NULL;

COMMENT ON COLUMN public.store_orders.delivery_place_id IS
  'Immutable order-time snapshot of the buyer delivery Google Places place_id.';
COMMENT ON COLUMN public.store_orders.delivery_formatted_address IS
  'Immutable order-time snapshot of the buyer delivery formatted address.';
COMMENT ON COLUMN public.store_orders.delivery_detail_address IS
  'Immutable order-time snapshot of the buyer-entered delivery detail address.';
COMMENT ON COLUMN public.store_orders.delivery_note IS
  'Immutable order-time snapshot of the buyer delivery request note.';
COMMENT ON COLUMN public.store_orders.delivery_latitude IS
  'Immutable order-time snapshot of buyer delivery latitude.';
COMMENT ON COLUMN public.store_orders.delivery_longitude IS
  'Immutable order-time snapshot of buyer delivery longitude.';
COMMENT ON COLUMN public.store_orders.checkout_straight_distance_meters IS
  'Checkout-time straight-line distance store-to-buyer in meters.';
