-- H-03 (2026-10-28 delivery audit §F) — new banner campaigns are appended to the end of their
-- surface order. Before: every writer inserted sort_order = 0 (column default / hardcoded) and the
-- runtime tie-break (newest start_at first) pushed a new banner above the Admin's #1 slide.
-- Single authority: this BEFORE INSERT trigger. Reordering stays an UPDATE (reorder writer).

CREATE OR REPLACE FUNCTION public.store_banner_ad_campaigns_assign_sort_order()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  -- serialize concurrent inserts on the same surface
  PERFORM pg_advisory_xact_lock(hashtext('store_banner_ad_campaigns.sort_order:' || coalesce(NEW.surface, '')));
  SELECT coalesce(max(c.sort_order), -1) + 1
    INTO NEW.sort_order
  FROM public.store_banner_ad_campaigns c
  WHERE c.surface IS NOT DISTINCT FROM NEW.surface;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_store_banner_ad_campaigns_assign_sort_order ON public.store_banner_ad_campaigns;
CREATE TRIGGER trg_store_banner_ad_campaigns_assign_sort_order
  BEFORE INSERT ON public.store_banner_ad_campaigns
  FOR EACH ROW
  EXECUTE FUNCTION public.store_banner_ad_campaigns_assign_sort_order();
