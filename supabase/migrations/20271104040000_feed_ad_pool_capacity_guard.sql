-- 광고 S-3 (Owner 「S-3 진행」 2026-11-03) — 피드 배너 풀 수용량을 DB 가 지킨다
--   이전: 어드민 등록·회원 신청 승인만 TS 에서 미리 검사 → 회원 연장(결제)·이벤트 배포 경로는 검사 없음,
--         같은 순간 두 건을 승인하면 둘 다 통과(잠금 없음)
--   지금: feed_ad_campaigns 에 행이 「점유」 상태가 되는 모든 INSERT/UPDATE 에서 같은 풀을 잠그고(advisory xact lock) 센다
--   점유 = lib/ads/feed-ad-pool-capacity.ts feedAdPoolOccupiesCampaign 과 같다:
--         status 가 비어 있지 않고 ended·rejected·draft 가 아님 + (end_at 없음 또는 end_at > now)
--   풀 = 위치 + 대상 (TRADE_CATEGORY = 업종 · COMMUNITY_TOPIC = 주제 · 홈 = 대상 없음)
--         — 피드 배너 잠금 계약 「TOPIC 후보 풀 = 같은 주제만」 · 업종이 다른 광고끼리 자리를 막지 않는다
--   수용량 = 3 (banner-placement-capacity-ssot TRADE_HOME·COMMUNITY_HOME defaultCapacity · 업종/주제도 같은 3)
--   이미 점유 중인 행의 수정(연장·일시정지·재개 등 같은 풀)은 검사하지 않는다 — 지금 있는 행은 막지 않는다

CREATE OR REPLACE FUNCTION public.feed_ad_campaigns_pool_capacity_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_place text := upper(coalesce(NEW.placement, ''));
  v_target text;
  v_cap integer := 3;
  v_used integer;
  v_new_occ boolean;
  v_old_occ boolean;
BEGIN
  v_new_occ := lower(coalesce(NEW.status, '')) NOT IN ('', 'ended', 'rejected', 'draft')
               AND (NEW.end_at IS NULL OR NEW.end_at > now());
  IF NOT v_new_occ THEN
    RETURN NEW;
  END IF;

  v_target := CASE v_place
                WHEN 'TRADE_CATEGORY' THEN coalesce(NEW.target_category_id, '')
                WHEN 'COMMUNITY_TOPIC' THEN coalesce(NEW.target_topic_slug, '')
                ELSE ''
              END;

  IF TG_OP = 'UPDATE' THEN
    v_old_occ := lower(coalesce(OLD.status, '')) NOT IN ('', 'ended', 'rejected', 'draft')
                 AND (OLD.end_at IS NULL OR OLD.end_at > now());
    IF v_old_occ
       AND upper(coalesce(OLD.placement, '')) = v_place
       AND (CASE v_place
              WHEN 'TRADE_CATEGORY' THEN coalesce(OLD.target_category_id, '')
              WHEN 'COMMUNITY_TOPIC' THEN coalesce(OLD.target_topic_slug, '')
              ELSE ''
            END) = v_target THEN
      RETURN NEW;
    END IF;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('feed_ad_pool:' || v_place || ':' || v_target));

  SELECT count(*) INTO v_used
    FROM public.feed_ad_campaigns c
   WHERE c.id <> NEW.id
     AND upper(coalesce(c.placement, '')) = v_place
     AND CASE v_place
           WHEN 'TRADE_CATEGORY' THEN coalesce(c.target_category_id, '')
           WHEN 'COMMUNITY_TOPIC' THEN coalesce(c.target_topic_slug, '')
           ELSE ''
         END = v_target
     AND lower(coalesce(c.status, '')) NOT IN ('', 'ended', 'rejected', 'draft')
     AND (c.end_at IS NULL OR c.end_at > now());

  IF v_used >= v_cap THEN
    RAISE EXCEPTION 'feed_ad_pool_capacity_full'
      USING ERRCODE = 'P0001', DETAIL = format('%s/%s %s %s', v_used, v_cap, v_place, v_target);
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS feed_ad_campaigns_pool_capacity_guard ON public.feed_ad_campaigns;
CREATE TRIGGER feed_ad_campaigns_pool_capacity_guard
  BEFORE INSERT OR UPDATE OF status, end_at, placement, target_category_id, target_topic_slug
  ON public.feed_ad_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.feed_ad_campaigns_pool_capacity_guard();
