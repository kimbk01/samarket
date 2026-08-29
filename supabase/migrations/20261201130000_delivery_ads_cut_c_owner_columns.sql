-- CUT C — Owner Store Sponsored mutation columns (idempotency + review notes surface)
-- Pricing charge execution still NONE (CUT H).

ALTER TABLE public.store_paid_ad_campaigns
  ADD COLUMN IF NOT EXISTS review_notes text NULL,
  ADD COLUMN IF NOT EXISTS owner_client_request_id text NULL;

CREATE UNIQUE INDEX IF NOT EXISTS store_paid_ad_campaigns_owner_client_request_uidx
  ON public.store_paid_ad_campaigns (owner_user_id, owner_client_request_id)
  WHERE owner_client_request_id IS NOT NULL AND owner_user_id IS NOT NULL;

COMMENT ON COLUMN public.store_paid_ad_campaigns.review_notes IS
  'Admin review / change-request / reject notes visible to Owner (CUT F writes).';

COMMENT ON COLUMN public.store_paid_ad_campaigns.owner_client_request_id IS
  'Owner create/submit idempotency key — duplicate CTA must not create a second campaign.';
