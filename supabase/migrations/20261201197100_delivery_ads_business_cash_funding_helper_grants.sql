-- Harden Business Cash funding helper grants (service_role only).
-- Companion to 20261201197000 — no CUT3, no CUT H enablement.

BEGIN;

REVOKE ALL ON FUNCTION public.delivery_ad_campaign_funding_allows_active(text, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delivery_ad_campaign_funding_allows_active(text, uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delivery_ad_campaign_funding_allows_active(text, uuid, text) TO service_role;

COMMIT;
