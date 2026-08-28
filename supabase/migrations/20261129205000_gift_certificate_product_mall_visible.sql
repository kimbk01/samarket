-- DIBAY Gift Admin M2: mall_visible (HIDE ≠ PAUSE)
-- Product Mall visibility independent of active sales state.

BEGIN;

ALTER TABLE public.gift_certificate_products
  ADD COLUMN IF NOT EXISTS mall_visible boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.gift_certificate_products.mall_visible IS
  'Gift Mall customer visibility. Independent of active (PAUSE). HIDE sets false; PAUSE sets active=false.';

COMMIT;
