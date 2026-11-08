-- 롤백: 'HOME' 노출 화면 허용값 제거. HOME 행이 있으면 중단한다.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.platform_popup_campaign_surfaces WHERE surface = 'HOME') THEN
    RAISE EXCEPTION 'HOME surface rows exist — reassign them before rollback';
  END IF;
END $$;

ALTER TABLE public.platform_popup_campaign_surfaces
  DROP CONSTRAINT IF EXISTS platform_popup_campaign_surfaces_surface_check;

ALTER TABLE public.platform_popup_campaign_surfaces
  ADD CONSTRAINT platform_popup_campaign_surfaces_surface_check
  CHECK (surface IN ('GLOBAL','COMMUNITY','TRADE','DELIVERY','DELIVERY_OWNER','ADMIN','MYPAGE'));
