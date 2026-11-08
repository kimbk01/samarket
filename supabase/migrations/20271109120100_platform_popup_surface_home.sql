-- 팝업·당겨서 새로고침 띠 광고 노출 화면에 'HOME'(앱 홈 `/`·`/home`) 추가
-- (Owner 「구현 시작」 2026-11-09, 홈 설계안 v11 §9). 기존 값은 그대로, 허용값만 하나 늘린다.
-- GLOBAL 은 앱 코드에서 HOME 까지 펼친다.
-- 롤백: supabase/rollback/20271109120100_platform_popup_surface_home_rollback.sql

ALTER TABLE public.platform_popup_campaign_surfaces
  DROP CONSTRAINT IF EXISTS platform_popup_campaign_surfaces_surface_check;

ALTER TABLE public.platform_popup_campaign_surfaces
  ADD CONSTRAINT platform_popup_campaign_surfaces_surface_check
  CHECK (surface IN (
    'GLOBAL',
    'HOME',
    'COMMUNITY',
    'TRADE',
    'DELIVERY',
    'DELIVERY_OWNER',
    'ADMIN',
    'MYPAGE'
  ));

COMMENT ON TABLE public.platform_popup_campaign_surfaces IS
  'Canonical surface targeting. GLOBAL expands in code to HOME+COMMUNITY+TRADE+DELIVERY+DELIVERY_OWNER+ADMIN+MYPAGE. Critical ops are runtime gates, not surface rows.';
