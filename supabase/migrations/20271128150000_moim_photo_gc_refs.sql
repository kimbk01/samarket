-- 모임 감사 6번 묶음 6-A — 모임 사진이 커뮤니티 사진 정리 작업에 지워지지 않게 「쓰는 곳」에 모임 열 6개 추가 (신규 결함 · P1 데이터 손실)
-- 설계: docs/audit/moim-bundle6-design-2026-11-28.md (Owner 「구현 승인」 2026-11-28)
-- 근거: 모임 사진은 post-images/{uid}/community/{uuid}.ext (커뮤니티 업로드) 경로. 매일 정리 작업(community-post-images-gc)은
--   72시간 지난 「쓰는 곳 없는」 파일을 지운다. 운영 정의(md5 04a2bd9b…)의 쓰는 곳 52곳에 moim 표가 없음.
-- 바꾼 것: moims.cover_image_url · moim_posts.images · moim_schedules.images · moim_album_items.url ·
--   moim_members.avatar_url · moim_member_profile_history.avatar_url 6줄 추가. 그 밖은 운영 정의 그대로.
-- 함수 본문에는 비 ASCII 주석을 넣지 않는다 (운영 적용 도구가 멈춤).
-- 롤백: docs/audit/moim-bundle6a-backup-definitions-2026-11-28.sql

create or replace function public.community_post_image_unreferenced_excluding_posts(p_names text[], p_exclude_post_ids uuid[])
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
  ex as (
    select coalesce(p_exclude_post_ids, '{}'::uuid[]) as ids
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
      union all select image_url::text as t from public.community_post_images, ex where post_id <> all(ex.ids)
      union all select content::text as t from public.community_post_revisions, ex where post_id <> all(ex.ids)
      union all select content_blocks::text as t from public.community_post_revisions, ex where post_id <> all(ex.ids)
      union all select content::text as t from public.community_posts, ex where id <> all(ex.ids)
      union all select content_blocks::text as t from public.community_posts, ex where id <> all(ex.ids)
      union all select display_author_avatar_url::text as t from public.community_posts, ex where id <> all(ex.ids)
      union all select images::text as t from public.community_posts, ex where id <> all(ex.ids)
      union all select thumbnail_url::text as t from public.community_posts, ex where id <> all(ex.ids)
      union all select image_url::text as t from public.dibay_item_images
      union all select thumbnail_url::text as t from public.dibay_items
      union all select image_url::text as t from public.feed_ad_creatives
      union all select image_url::text as t from public.feed_ad_request_creatives
      union all select body::text as t from public.group_messages
      union all select metadata::text as t from public.group_messages
      union all select body_backup::text as t from public.moderation_audit_messages
      union all select metadata_backup::text as t from public.moderation_audit_messages
      union all select cover_image_url::text as t from public.moims
      union all select images::text as t from public.moim_posts
      union all select images::text as t from public.moim_schedules
      union all select url::text as t from public.moim_album_items
      union all select avatar_url::text as t from public.moim_members
      union all select avatar_url::text as t from public.moim_member_profile_history
      union all select display_payload::text as t from public.notification_events
      union all select image_url::text as t from public.notifications
      union all select body::text as t from public.notifications
      union all select thumbnail_url::text as t from public.open_chat_rooms
      union all select content::text as t from public.philife_comments
      union all select content::text as t from public.philife_posts, ex where id <> all(ex.ids)
      union all select images::text as t from public.philife_posts, ex where id <> all(ex.ids)
      union all select thumbnail_url::text as t from public.philife_posts, ex where id <> all(ex.ids)
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

revoke all on function public.community_post_image_unreferenced_excluding_posts(text[], uuid[]) from public, anon, authenticated;
grant execute on function public.community_post_image_unreferenced_excluding_posts(text[], uuid[]) to service_role;

