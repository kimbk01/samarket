-- D-20① (ads-reaudit3-defect-design-2026-11-07) — 매장 없는 배달 배너 클릭도 기록한다.
--
-- 결함: delivery_ad_click_events.store_id NOT NULL + delivery_ad_record_click 의 `p_store_id IS NULL → invalid_payload`
--       → 매장 없는 배너(store_banner_ad_campaigns.store_id 는 NULL 허용) 클릭이 기록되지 않는다. (운영 해당 배너 0개)
-- 운영 확인(2026-11-07): 클릭 기록 함수 이름 = public.delivery_ad_record_click(text,uuid,uuid,text,uuid,uuid,uuid,text,integer,text,text,uuid,text,timestamptz)
--   · service_role 만 EXECUTE · 트리거 delivery_ad_events_skip_sample_store 는 store_id NULL 이면 통과(그대로).
--   · 귀속 함수 delivery_ad_reconcile_order_attribution 은 c.store_id = p_store_id 로만 찾는다 → 매장 없는 클릭은 주문 귀속 대상 아님(그대로).
-- 운영 현재 정의와 다른 점: 검사식에서 `OR p_store_id IS NULL` 한 줄만 뺐다. destination_type(store_*)·destination_id 필수는 그대로
--   (매장 없는 배너의 목적지 형식은 설계 문서에 없음 — 범위 밖 · 보고).
-- 웹 담당: lib/stores/advertising/delivery-ad-event-writer.ts recordDeliveryAdClickFromToken 의 `if (!p.storeId) return invalid_payload` 제거 필요.
--
-- 롤백 SQL (운영에 store_id NULL 행이 없을 때만):
--   create or replace … delivery_ad_record_click — 검사식에 `OR p_store_id IS NULL` 복원 (scratchpad/db3/orig-m1-06-delivery-ad-record-click.sql)
--   alter table public.delivery_ad_click_events alter column store_id set not null;

alter table public.delivery_ad_click_events alter column store_id drop not null;

CREATE OR REPLACE FUNCTION public.delivery_ad_record_click(p_event_id text, p_impression_event_id uuid, p_campaign_id uuid, p_product_kind text, p_creative_id uuid, p_inventory_id uuid, p_store_id uuid, p_surface text, p_placement_index integer, p_viewer_session_hash text, p_destination_type text, p_destination_id uuid, p_attribution_bridge_key text, p_occurred_at timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
BEGIN
  IF length(trim(coalesce(p_event_id, ''))) = 0
     OR p_campaign_id IS NULL
     OR p_product_kind NOT IN ('store_sponsored', 'banner')
     OR p_destination_type NOT IN ('store_detail', 'store_menu', 'store_promotion')
     OR p_destination_id IS NULL
     OR length(trim(coalesce(p_viewer_session_hash, ''))) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_payload');
  END IF;

  INSERT INTO public.delivery_ad_click_events (
    event_id, impression_event_id, campaign_id, product_kind, creative_id, inventory_id,
    store_id, surface, placement_index, viewer_session_hash, destination_type, destination_id,
    attribution_bridge_key, occurred_at
  ) VALUES (
    p_event_id, p_impression_event_id, p_campaign_id, p_product_kind, p_creative_id, p_inventory_id,
    p_store_id, p_surface, coalesce(p_placement_index, 0), p_viewer_session_hash,
    p_destination_type, p_destination_id, nullif(trim(coalesce(p_attribution_bridge_key, '')), ''),
    coalesce(p_occurred_at, now())
  )
  ON CONFLICT (event_id) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM public.delivery_ad_click_events WHERE event_id = p_event_id;
    RETURN jsonb_build_object('ok', true, 'deduped', true, 'id', v_id);
  END IF;

  RETURN jsonb_build_object('ok', true, 'deduped', false, 'id', v_id);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', 'db_error', 'detail', SQLERRM);
END;
$function$;

REVOKE ALL ON FUNCTION public.delivery_ad_record_click(text, uuid, uuid, text, uuid, uuid, uuid, text, integer, text, text, uuid, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delivery_ad_record_click(text, uuid, uuid, text, uuid, uuid, uuid, text, integer, text, text, uuid, text, timestamptz) TO service_role;
