-- Platform Popup surface expansion: ADMIN + DELIVERY_OWNER selectable targets.
-- OWNER_OPS is not a DB surface (legacy resolver label only → map to DELIVERY_OWNER in code).
-- GLOBAL expands in app code to COMMUNITY+TRADE+DELIVERY+DELIVERY_OWNER+ADMIN+MYPAGE.

ALTER TABLE public.platform_popup_campaign_surfaces
  DROP CONSTRAINT IF EXISTS platform_popup_campaign_surfaces_surface_check;

ALTER TABLE public.platform_popup_campaign_surfaces
  ADD CONSTRAINT platform_popup_campaign_surfaces_surface_check
  CHECK (surface IN (
    'GLOBAL',
    'COMMUNITY',
    'TRADE',
    'DELIVERY',
    'DELIVERY_OWNER',
    'ADMIN',
    'MYPAGE'
  ));

COMMENT ON TABLE public.platform_popup_campaign_surfaces IS
  'Canonical surface targeting. GLOBAL expands in code to COMMUNITY+TRADE+DELIVERY+DELIVERY_OWNER+ADMIN+MYPAGE. Critical ops are runtime gates, not surface rows.';
