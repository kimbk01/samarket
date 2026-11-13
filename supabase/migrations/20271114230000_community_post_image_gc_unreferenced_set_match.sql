-- 커뮤니티 사진 정리(GC) 미참조 판정 — 시간 초과 근본 수정 (Owner 「F 설계안 승인, 구현 진행」 2026-11-14)
--
-- 원인 (운영 측정 2026-11-14, 읽기 전용):
--   매일 03:50 PHT cron(/api/cron/community-post-images-gc)이 `statement timeout`(authenticator 8s)으로 실패 — 정리가 한 번도 끝나지 못함.
--   community_post_image_gc_candidates 실행 15.0~17.8초. 원인은 community_post_image_unreferenced 가
--   후보(최대 800)마다 참조 글자 전체(50개 열, 약 4만 행)를 position() 으로 다시 훑는 구조(후보 수 × 전체 행).
-- 수정:
--   ① 참조 글자에서 uuid 모양 문자열을 한 번만 뽑아 집합(found)으로 만들고, 집합에 있는 후보는 「참조됨」으로 바로 제외.
--   ② 집합에 없는 후보만 기존과 같은 position() 으로 다시 확인 — 판정 결과는 기존과 동일(참조된 사진을 지우는 일 없음).
--   참조 열 목록은 운영 현재 정의(pg_get_functiondef, 20271112200000 moim_m1b 반영 후 50줄) 그대로.
-- 운영 측정(같은 데이터): 기존 14.96초 · 새 방식 1.47초 · 결과 8건 동일.
-- 다른 함수(gc_candidates·discardable)는 이 함수를 그대로 부른다 — 시그니처·권한 불변.

create or replace function public.community_post_image_unreferenced(p_names text[])
returns table (name text)
language sql
stable
security definer
set search_path = public
as $fn$
  with cand as (
    select n as name,
           regexp_replace(regexp_replace(n, '^.*/', ''), '\.[A-Za-z0-9]+$', '') as stem
    from unnest(coalesce(p_names, '{}'::text[])) as n
  ),
  refs as materialized (
      select image_url::text as t from public.ads
      union all select mobile_image_url::text as t from public.ads
      union all select body::text as t from public.app_notices
      union all select hero_image_url::text as t from public.app_notices
      union all select body::text as t from public.chat_messages
      union all select metadata::text as t from public.chat_messages
      union all select content::text as t from public.comments
      union all select content::text as t from public.community_comments
      union all select content::text as t from public.community_messenger_messages
      union all select metadata::text as t from public.community_messenger_messages
      union all select avatar_url::text as t from public.community_messenger_room_profiles
      union all select avatar_url::text as t from public.community_messenger_rooms
      union all select thumbnail_url::text as t from public.community_operator_import_inbox
      union all select image_url::text as t from public.community_post_images
      union all select content::text as t from public.community_post_revisions
      union all select content_blocks::text as t from public.community_post_revisions
      union all select content::text as t from public.community_posts
      union all select content_blocks::text as t from public.community_posts
      union all select display_author_avatar_url::text as t from public.community_posts
      union all select images::text as t from public.community_posts
      union all select thumbnail_url::text as t from public.community_posts
      union all select image_url::text as t from public.dibay_item_images
      union all select thumbnail_url::text as t from public.dibay_items
      union all select image_url::text as t from public.feed_ad_creatives
      union all select image_url::text as t from public.feed_ad_request_creatives
      union all select body::text as t from public.group_messages
      union all select metadata::text as t from public.group_messages
      union all select body_backup::text as t from public.moderation_audit_messages
      union all select metadata_backup::text as t from public.moderation_audit_messages
      union all select display_payload::text as t from public.notification_events
      union all select image_url::text as t from public.notifications
      union all select body::text as t from public.notifications
      union all select thumbnail_url::text as t from public.open_chat_rooms
      union all select content::text as t from public.philife_comments
      union all select content::text as t from public.philife_posts
      union all select images::text as t from public.philife_posts
      union all select thumbnail_url::text as t from public.philife_posts
      union all select attachment_urls::text as t from public.platform_admin_inquiries
      union all select content::text as t from public.post_comments
      union all select url::text as t from public.post_images
      union all select content::text as t from public.posts
      union all select images::text as t from public.posts
      union all select thumbnail_url::text as t from public.posts
      union all select content::text as t from public.product_chat_messages
      union all select image_url::text as t from public.product_chat_messages
      union all select avatar_url::text as t from public.profiles
      union all select images_json::text as t from public.store_notices
      union all select image_urls::text as t from public.store_reviews
      union all select content::text as t from public.store_reviews
      union all select body::text as t from public.support_messages
      union all select image_urls::text as t from public.trade_showcase_items
  ),
  found as materialized (
    select distinct m[1] as stem
    from refs r,
         lateral regexp_matches(r.t, '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})', 'g') m
    where r.t is not null
  ),
  rest as materialized (
    select c.name, c.stem
    from cand c
    where length(c.stem) >= 32
      and not exists (select 1 from found f where f.stem = c.stem)
  )
  select x.name
  from rest x
  where not exists (select 1 from refs r where r.t is not null and position(x.stem in r.t) > 0);
$fn$;

revoke all on function public.community_post_image_unreferenced(text[]) from public, anon, authenticated;
grant execute on function public.community_post_image_unreferenced(text[]) to service_role;
