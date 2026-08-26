-- U1: Owner application UX fields + Admin reject reason
-- Production apply = separate gate (NOT auto-applied by this commit alone).

ALTER TABLE public.gift_certificate_applications
  ADD COLUMN IF NOT EXISTS requested_purchase_price integer NULL
    CHECK (requested_purchase_price IS NULL OR requested_purchase_price >= 0);

ALTER TABLE public.gift_certificate_applications
  ADD COLUMN IF NOT EXISTS image_url text NULL;

ALTER TABLE public.gift_certificate_applications
  ADD COLUMN IF NOT EXISTS rejection_reason text NULL;

COMMENT ON COLUMN public.gift_certificate_applications.requested_purchase_price IS
  'Owner requested mall purchase price (Point). Admin may set a different product.purchase_price.';
COMMENT ON COLUMN public.gift_certificate_applications.image_url IS
  'Optional artwork URL from owner upload (presentation only).';
COMMENT ON COLUMN public.gift_certificate_applications.rejection_reason IS
  'Required when Admin rejects; shown on Owner application history.';
