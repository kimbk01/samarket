-- 2026-10-28 delivery sample operations (audit §F S-1·S-2·S-4·S-6).
-- store_kind = classification only (real / sample / legacy_test). Customer exposure stays
-- approval_status + is_visible (single exposure authority, unchanged).

-- S-1 — 매장 유형
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS store_kind text NOT NULL DEFAULT 'real';

ALTER TABLE public.stores DROP CONSTRAINT IF EXISTS stores_store_kind_check;
ALTER TABLE public.stores
  ADD CONSTRAINT stores_store_kind_check CHECK (store_kind IN ('real', 'sample', 'legacy_test'));

CREATE INDEX IF NOT EXISTS idx_stores_store_kind ON public.stores (store_kind) WHERE store_kind <> 'real';

COMMENT ON COLUMN public.stores.store_kind IS
  'real = 정식 매장 · sample = 플랫폼 운영 체험 매장(오너 없음, 주문 불가) · legacy_test = 과거 개발·검증 데이터. 고객 노출은 approval_status + is_visible 만 판정.';

-- S-2 — 샘플 매장만 오너 없음 (실매장·테스트 매장은 기존처럼 오너 필수). 1계정 1매장 부분 유니크 인덱스는 그대로.
ALTER TABLE public.stores ALTER COLUMN owner_user_id DROP NOT NULL;
ALTER TABLE public.stores DROP CONSTRAINT IF EXISTS stores_owner_required_unless_sample;
ALTER TABLE public.stores
  ADD CONSTRAINT stores_owner_required_unless_sample CHECK (
    (store_kind = 'sample' AND owner_user_id IS NULL)
    OR (store_kind <> 'sample' AND owner_user_id IS NOT NULL)
  );

-- S-4 — 샘플 매장은 판매 승인 불가 → 기존 create_store_order_atomic 의 store_not_selling 이 최종 차단 (RPC 무변경)
CREATE OR REPLACE FUNCTION public.store_sales_permissions_block_sample_approval()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF (NEW.allowed_to_sell IS TRUE OR NEW.sales_status = 'approved')
     AND EXISTS (SELECT 1 FROM public.stores s WHERE s.id = NEW.store_id AND s.store_kind = 'sample') THEN
    RAISE EXCEPTION 'sample_store_cannot_sell' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_store_sales_permissions_block_sample_approval ON public.store_sales_permissions;
CREATE TRIGGER trg_store_sales_permissions_block_sample_approval
  BEFORE INSERT OR UPDATE ON public.store_sales_permissions
  FOR EACH ROW
  EXECUTE FUNCTION public.store_sales_permissions_block_sample_approval();

-- S-6 — 샘플 매장으로 가는 광고의 노출·클릭은 성과 통계에 기록하지 않는다 (기록 RPC 무변경, 행만 버림)
CREATE OR REPLACE FUNCTION public.delivery_ad_events_skip_sample_store()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.store_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.stores s WHERE s.id = NEW.store_id AND s.store_kind = 'sample') THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_delivery_ad_impression_events_skip_sample ON public.delivery_ad_impression_events;
CREATE TRIGGER trg_delivery_ad_impression_events_skip_sample
  BEFORE INSERT ON public.delivery_ad_impression_events
  FOR EACH ROW
  EXECUTE FUNCTION public.delivery_ad_events_skip_sample_store();

DROP TRIGGER IF EXISTS trg_delivery_ad_click_events_skip_sample ON public.delivery_ad_click_events;
CREATE TRIGGER trg_delivery_ad_click_events_skip_sample
  BEFORE INSERT ON public.delivery_ad_click_events
  FOR EACH ROW
  EXECUTE FUNCTION public.delivery_ad_events_skip_sample_store();
