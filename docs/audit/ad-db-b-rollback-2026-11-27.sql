-- B-DB 되돌리기 (20271127110000_ad_db_b_feed_ad.sql) — Owner 승인 후에만 실행
-- ① 글 상태 트리거 2개에 끼운 배너 연동을 빼고(역순) ② 새 함수·표를 지운다.
-- 주의: 코드가 member_feed_ad_renew_v2·member_cancel_feed_ad_request·system_expire_feed_ad_requests 를 부르므로
--       코드(PR)를 먼저 되돌린 뒤 실행한다. 연장 기록 표를 지우면 그동안의 연장 기록 행도 사라진다(원장은 그대로).

CREATE OR REPLACE FUNCTION public._ads_adb_b_revert_once(p_name text, p_new text, p_old text, p_marker text)
RETURNS void LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE
  v_oid oid;
  v_def text;
BEGIN
  SELECT p.oid INTO STRICT v_oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = p_name;
  v_def := pg_get_functiondef(v_oid);
  IF position(p_marker IN v_def) = 0 THEN
    RETURN;
  END IF;
  IF (length(v_def) - length(replace(v_def, p_new, ''))) / greatest(length(p_new), 1) <> 1 THEN
    RAISE EXCEPTION '%: 되돌릴 문장이 정확히 1번 있어야 함', p_name;
  END IF;
  EXECUTE replace(v_def, p_new, p_old);
END $$;

SELECT public._ads_adb_b_revert_once(
  'community_posts_promotion_sync',
  $new$  -- FB-03 상태 (B-DB 2026-11-27): 이 글에 연결된 회원 배너 멈춤·재개·종료
  if (new.status is distinct from old.status
      or new.is_hidden is distinct from old.is_hidden
      or new.is_deleted is distinct from old.is_deleted)
     and exists (select 1 from public.feed_ad_campaigns c
                  where c.destination_type = 'community_post' and c.destination_id = new.id::text
                    and c.source = 'MEMBER_REQUESTED' and c.status in ('active', 'scheduled', 'paused')) then
    perform public.feed_ad_sync_destination('community_post', new.id, false);
  end if;
  return null;
end;
$function$$new$,
  $old$  return null;
end;
$function$$old$,
  'FB-03 상태 (B-DB 2026-11-27)'
);

SELECT public._ads_adb_b_revert_once(
  'community_posts_promotion_sync',
  $new$      perform public.community_promotion_sync_post(old.id, true);
    end if;
    -- FB-03 삭제 (B-DB 2026-11-27): 이 글에 연결된 회원 배너 종료
    if exists (select 1 from public.feed_ad_campaigns c
                where c.destination_type = 'community_post' and c.destination_id = old.id::text
                  and c.source = 'MEMBER_REQUESTED' and c.status in ('active', 'scheduled', 'paused')) then
      perform public.feed_ad_sync_destination('community_post', old.id, true);
    end if;
    return null;
  end if;$new$,
  $old$      perform public.community_promotion_sync_post(old.id, true);
    end if;
    return null;
  end if;$old$,
  'FB-03 삭제 (B-DB 2026-11-27)'
);

SELECT public._ads_adb_b_revert_once(
  'posts_trade_promotion_sync',
  $new$  -- FB-03 상태 (B-DB 2026-11-27): 이 글에 연결된 회원 배너 멈춤·재개·종료
  if (new.status is distinct from old.status
      or new.seller_listing_state is distinct from old.seller_listing_state
      or new.owner_state is distinct from old.owner_state
      or new.moderation_state is distinct from old.moderation_state
      or new.is_deleted is distinct from old.is_deleted)
     and exists (select 1 from public.feed_ad_campaigns c
                  where c.destination_type = 'trade_listing' and c.destination_id = new.id::text
                    and c.source = 'MEMBER_REQUESTED' and c.status in ('active', 'scheduled', 'paused')) then
    perform public.feed_ad_sync_destination('trade_listing', new.id, false);
  end if;
  return null;
end;
$function$$new$,
  $old$  return null;
end;
$function$$old$,
  'FB-03 상태 (B-DB 2026-11-27)'
);

SELECT public._ads_adb_b_revert_once(
  'posts_trade_promotion_sync',
  $new$      perform public.trade_promotion_sync_listing(old.id, true);
    end if;
    -- FB-03 삭제 (B-DB 2026-11-27): 이 글에 연결된 회원 배너 종료
    if exists (select 1 from public.feed_ad_campaigns c
                where c.destination_type = 'trade_listing' and c.destination_id = old.id::text
                  and c.source = 'MEMBER_REQUESTED' and c.status in ('active', 'scheduled', 'paused')) then
      perform public.feed_ad_sync_destination('trade_listing', old.id, true);
    end if;
    return null;
  end if;$new$,
  $old$      perform public.trade_promotion_sync_listing(old.id, true);
    end if;
    return null;
  end if;$old$,
  'FB-03 삭제 (B-DB 2026-11-27)'
);

DROP FUNCTION public._ads_adb_b_revert_once(text, text, text, text);
DROP FUNCTION IF EXISTS public.feed_ad_sync_destination(text, uuid, boolean);
DROP FUNCTION IF EXISTS public.system_expire_feed_ad_requests(integer, integer);
DROP FUNCTION IF EXISTS public.member_cancel_feed_ad_request(uuid, uuid, integer);
DROP FUNCTION IF EXISTS public._feed_ad_release_holds(uuid, text, text, uuid);
DROP FUNCTION IF EXISTS public.member_feed_ad_renew_v2(uuid, uuid, text, text, integer, integer);
DROP TABLE IF EXISTS public.feed_ad_request_renewals;
