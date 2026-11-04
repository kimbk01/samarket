-- 광고 수정 설계 2026-11-04 · FB-E07 (피드 배너 기록 함수 — 소재 id 필수 · 위치 허용 목록)
-- 근거: docs/audit/ads-fix-design-2026-11-04.md §3 FB-E07
-- 기준 = 운영 현재 정의 record_feed_ad_event(uuid,uuid,text,text,text,integer,uuid) (2026-11-04 pg_get_functiondef). 바꾼 부분만 「FB-E07」 표시.
--   · p_creative_id 가 null 이면 {ok:false, error:'creative_required'} (중복 키에 '-' 들어간 행이 생기지 않음)
--   · p_placement 가 허용 목록(TRADE_HOME · TRADE_CATEGORY · COMMUNITY_HOME · COMMUNITY_TOPIC — lib/ads/feed-ad-placement.ts
--     FeedAdPlacement · feed_ad_campaigns_placement_check 와 같음) 밖이거나 null 이면 {ok:false, error:'invalid_placement'}
--   운영 feed_ad_events (2026-11-04): TRADE_HOME impression 17행 · 소재 id 없는 행 0 · 다른 위치 값 0.
--
-- 롤백 SQL: 아래 두 「FB-E07」 IF 블록을 지운 같은 본문으로 CREATE OR REPLACE (= 운영 이전 정의 2026-11-04 그대로)

CREATE OR REPLACE FUNCTION public.record_feed_ad_event(p_campaign_id uuid, p_creative_id uuid, p_event_type text, p_placement text, p_session_id text, p_slot_ordinal integer, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_now timestamptz := now();
  v_session text := left(coalesce(nullif(btrim(p_session_id), ''), p_user_id::text, 'anon'), 128);
  v_slot integer := GREATEST(0, LEAST(1000, coalesce(p_slot_ordinal, 0)));
  v_key text;
  v_id uuid;
BEGIN
  IF p_event_type NOT IN ('impression', 'click') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_event_type');
  END IF;

  -- FB-E07: 소재 id 없는 기록 거부 (키 '-' 행 금지)
  IF p_creative_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'creative_required');
  END IF;
  -- FB-E07: 위치 값 허용 목록
  IF p_placement IS NULL OR p_placement NOT IN ('TRADE_HOME', 'TRADE_CATEGORY', 'COMMUNITY_HOME', 'COMMUNITY_TOPIC') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_placement');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.feed_ad_campaigns c
     WHERE c.id = p_campaign_id
       AND c.status = 'active'
       AND (c.start_at IS NULL OR c.start_at <= v_now)
       AND (c.end_at IS NULL OR c.end_at > v_now)
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_live');
  END IF;

  IF p_creative_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.feed_ad_creatives cr
     WHERE cr.id = p_creative_id AND cr.campaign_id = p_campaign_id AND cr.is_active
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'creative_mismatch');
  END IF;

  v_key := md5(concat_ws('|', p_campaign_id::text, coalesce(p_creative_id::text, '-'), v_session,
                         v_slot::text, to_char(date_trunc('hour', v_now AT TIME ZONE 'UTC'), 'YYYYMMDDHH24')))
           || CASE WHEN p_event_type = 'click' THEN ':click' ELSE '' END;

  INSERT INTO public.feed_ad_events (campaign_id, creative_id, event_type, placement, user_id, dedupe_key)
  VALUES (p_campaign_id, p_creative_id, p_event_type, left(p_placement, 64), p_user_id, v_key)
  ON CONFLICT (dedupe_key) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'deduped', true);
  END IF;

  IF p_event_type = 'impression' THEN
    UPDATE public.feed_ad_campaigns SET impression_count = coalesce(impression_count, 0) + 1 WHERE id = p_campaign_id;
  ELSE
    UPDATE public.feed_ad_campaigns SET click_count = coalesce(click_count, 0) + 1 WHERE id = p_campaign_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'deduped', false, 'id', v_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.record_feed_ad_event(uuid, uuid, text, text, text, integer, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_feed_ad_event(uuid, uuid, text, text, text, integer, uuid) TO service_role;
