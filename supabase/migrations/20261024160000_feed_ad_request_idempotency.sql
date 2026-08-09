-- PHASE 1: member feed-ad-request apply idempotency (F7 double HOLD 방지)
-- Runs after 20261024120000_feed_ad_member_requests.sql
-- Additive only. Runtime price SSOT remains CODE (lib/ads/feed-ad-products.ts).

BEGIN;

ALTER TABLE public.feed_ad_requests
  ADD COLUMN IF NOT EXISTS idempotency_key text;

COMMENT ON COLUMN public.feed_ad_requests.idempotency_key IS
  'Client Idempotency-Key; unique per user when set. Prevents duplicate HOLD on double submit.';

CREATE UNIQUE INDEX IF NOT EXISTS feed_ad_requests_user_idempotency_uidx
  ON public.feed_ad_requests (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL AND length(trim(idempotency_key)) > 0;

COMMIT;
