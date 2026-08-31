-- DIBAY open-event sample commercial seed (Admin-changeable; snapshots stay immutable).
-- Updates existing delivery_ad_packages / partner_config rows only — no parallel tables.
-- Prices are PHP major × 100 (centavos).

UPDATE public.delivery_ad_packages
SET
  price_amount_minor = 12000,
  enabled = true,
  updated_at = now()
WHERE product_kind = 'store_sponsored'
  AND inventory_key = 'STORES_HOME_FEED'
  AND code = '7_day';

UPDATE public.delivery_ad_packages
SET
  price_amount_minor = 22000,
  enabled = true,
  updated_at = now()
WHERE product_kind = 'store_sponsored'
  AND inventory_key = 'STORES_HOME_FEED'
  AND code = '15_day';

UPDATE public.delivery_ad_packages
SET
  price_amount_minor = 39000,
  enabled = true,
  updated_at = now()
WHERE product_kind = 'store_sponsored'
  AND inventory_key = 'STORES_HOME_FEED'
  AND code = '30_day';

UPDATE public.delivery_ad_packages
SET
  price_amount_minor = 10000,
  enabled = true,
  updated_at = now()
WHERE product_kind = 'store_sponsored'
  AND inventory_key = 'STORES_CATEGORY_FEED'
  AND code = '7_day';

UPDATE public.delivery_ad_packages
SET
  price_amount_minor = 18000,
  enabled = true,
  updated_at = now()
WHERE product_kind = 'store_sponsored'
  AND inventory_key = 'STORES_CATEGORY_FEED'
  AND code = '15_day';

UPDATE public.delivery_ad_packages
SET
  price_amount_minor = 32000,
  enabled = true,
  updated_at = now()
WHERE product_kind = 'store_sponsored'
  AND inventory_key = 'STORES_CATEGORY_FEED'
  AND code = '30_day';

UPDATE public.delivery_ad_packages
SET
  price_amount_minor = 35000,
  enabled = true,
  updated_at = now()
WHERE product_kind = 'banner'
  AND inventory_key = 'STORES_HOME_HERO'
  AND code = '7_day';

UPDATE public.delivery_ad_packages
SET
  price_amount_minor = 65000,
  enabled = true,
  updated_at = now()
WHERE product_kind = 'banner'
  AND inventory_key = 'STORES_HOME_HERO'
  AND code = '15_day';

UPDATE public.delivery_ad_packages
SET
  price_amount_minor = 110000,
  enabled = true,
  updated_at = now()
WHERE product_kind = 'banner'
  AND inventory_key = 'STORES_HOME_HERO'
  AND code = '30_day';

UPDATE public.delivery_ad_packages
SET
  price_amount_minor = 25000,
  enabled = true,
  updated_at = now()
WHERE product_kind = 'banner'
  AND inventory_key = 'STORES_SEARCH_TOP'
  AND code = '7_day';

UPDATE public.delivery_ad_packages
SET
  price_amount_minor = 45000,
  enabled = true,
  updated_at = now()
WHERE product_kind = 'banner'
  AND inventory_key = 'STORES_SEARCH_TOP'
  AND code = '15_day';

UPDATE public.delivery_ad_packages
SET
  price_amount_minor = 79000,
  enabled = true,
  updated_at = now()
WHERE product_kind = 'banner'
  AND inventory_key = 'STORES_SEARCH_TOP'
  AND code = '30_day';

UPDATE public.delivery_ad_partner_config
SET
  enabled = true,
  accepting_new_members = true,
  monthly_fee_minor = 12000,
  advertising_discount_percent = 15,
  version = version + 1,
  updated_at = now()
WHERE id = 'default';

COMMENT ON TABLE public.delivery_ad_packages IS
  'Sellable packages. Open-event sample prices seeded 20261201260000; Admin may change later. Existing campaign commercial snapshots stay immutable.';