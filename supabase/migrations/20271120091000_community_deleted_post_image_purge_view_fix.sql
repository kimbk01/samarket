-- 보정: 삭제 글 사진 정리 판정에서 philife_posts 뷰도 대상 글을 뺀다 (20271120090000 의 결함)
-- 감사: docs/audit/lounge-paste-images-2026-11-20.md §14
--
-- 원인 (운영 확인 2026-11-20 09:08 PHT, 20271120090000 적용 직후 읽기 전용):
--   public.philife_posts 는 community_posts 를 그대로 보여 주는 뷰(relkind v, SELECT … FROM community_posts)다.
--   참조 목록의 philife_posts.content·images·thumbnail_url 줄에는 제외 조건이 없어, 대상 글을 빼도 같은 글이 뷰로 「참조 중」이 됐다.
--   → 삭제 30일 지난 글 사진이 지워지지 않고 「정리 완료」로만 표시될 뻔했다(첫 대상은 2026-12-20 이후라 실제 피해 없음).
-- 수정: 그 세 줄에도 같은 제외 조건. 제외 목록이 빈 기존 함수(community_post_image_unreferenced)의 결과는 바뀌지 않는다.
-- 확인: 삭제 글 1c01ac44 사진 2장 — 보정 전 제외해도 「참조」(philife_posts) · 보정 조건으로 남는 참조 0건(읽기 전용 조회).

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

