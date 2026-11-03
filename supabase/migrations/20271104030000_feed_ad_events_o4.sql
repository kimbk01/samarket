-- Owner 결정 O-4 (2026-11-03 「권장안대로」 · 「DB 3건 진행」) — 피드 배너 노출·클릭 기록
-- 설계: docs/audit/ads-owner-decisions-db-design-2026-11-03.md §O-4
--   노출 = 화면 50% 이상 1초 · 클릭 = 누름 (배달 배너와 같은 기준)
--   중복 방지 키는 서버(이 함수)가 만든다: 캠페인 + 소재 + 화면 세션 + 자리 번호 + 1시간 단위 (+ 「click」)
--   새 행이 들어간 때만 feed_ad_campaigns.impression_count / click_count 를 +1 한다
--   지금 노출 가능한 캠페인·소재(목록 조회 listEligibleFeedAdCampaigns 와 같은 조건)만 받는다

CREATE TABLE IF NOT EXISTS public.feed_ad_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.feed_ad_campaigns (id) ON DELETE CASCADE,
  creative_id uuid REFERENCES public.feed_ad_creatives (id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN ('impression', 'click')),
  placement text,
  user_id uuid,
  dedupe_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS feed_ad_events_campaign_created_idx
  ON public.feed_ad_events (campaign_id, created_at DESC);

ALTER TABLE public.feed_ad_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.feed_ad_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.feed_ad_events TO service_role;

CREATE OR REPLACE FUNCTION public.record_feed_ad_event(
  p_campaign_id uuid,
  p_creative_id uuid,
  p_event_type text,
  p_placement text,
  p_session_id text,
  p_slot_ordinal integer,
  p_user_id uuid DEFAULT NULL::uuid
)
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
