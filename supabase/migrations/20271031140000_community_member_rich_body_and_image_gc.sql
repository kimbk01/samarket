-- 커뮤니티 회원 서식 본문 · 커뮤니티 글 사진 정리 (Owner 승인 ①③ 2026-10-31)
-- 근거: docs/audit/philife-editor-storage-design-2026-10-31.md §2 · §5
--
-- ① content_blocks 를 회원 글(origin_kind = 'member')에도 허용 — 추가형, 기존 행 변경 없음.
--    content 는 계속 평문 원천(요약 트리거·검색). 서버가 블록에서 content 를 만든다.
--    롤백: update community_posts set content_blocks = null where origin_kind = 'member'; 후 제약 원복.
--
-- ③ 사진 참조 판정 함수(읽기 전용) — 아래 열 어디에든 파일 이름(uuid)이 있으면 「사용 중」 → 지우지 않는다.
--    (2026-10-31 운영 재검증에 쓴 63개 열과 같은 목록. 새 기능이 post-images 주소를 저장하면 이 목록에 추가해야 한다.)
--    삭제는 이 함수가 아니라 서버(서비스 키)가 저장소 API 로만 한다. service_role 만 실행 가능.

alter table public.community_posts
  drop constraint if exists community_posts_content_blocks_imported_only_check;
alter table public.community_posts
  drop constraint if exists community_posts_content_blocks_origin_check;
alter table public.community_posts
  add constraint community_posts_content_blocks_origin_check
  check (
    content_blocks is null
    or (origin_kind in ('imported', 'member') and jsonb_typeof(content_blocks) = 'array')
  );

comment on column public.community_posts.content_blocks is
  'Imported posts: sanitized source structure. Member posts: sanitized rich body (headings, inline bold/italic/link runs, lists, quotes, tables, photo captions) — lib/community/imported-content-blocks.ts. content stays the plain-text authority (server derives it from blocks).';

/** p_names = post-images 객체 경로. 어디에서도 참조되지 않는 경로만 돌려준다. */
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
      union all select body::text as t from public.community_chat_messages
      union all select metadata::text as t from public.community_chat_messages
      union all select thumbnail_url::text as t from public.community_chat_rooms
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
      union all select image_url::text as t from public.meeting_album_items
      union all select content::text as t from public.meeting_feed_comments
      union all select image_url::text as t from public.meeting_feed_images
      union all select content::text as t from public.meeting_feed_posts
      union all select file_url::text as t from public.meeting_open_chat_attachments
      union all select open_profile_image_url::text as t from public.meeting_open_chat_members
      union all select content::text as t from public.meeting_open_chat_messages
      union all select thumbnail_url::text as t from public.meeting_open_chat_rooms
      union all select cover_image_url::text as t from public.meetings
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
  )
  select c.name
  from cand c
  where length(c.stem) >= 32
    and not exists (select 1 from refs r where r.t is not null and position(c.stem in r.t) > 0);
$fn$;

/**
 * 매일 정리 대상: 커뮤니티 글 사진 원본(`{uid}/community/{uuid}.ext`, `{uid}/community/import/{uuid}.ext`) 중
 * p_created_after 이후 생성 · p_min_age 경과 · 미참조. 기존(배포 이전) 파일은 대상이 아니다 — Owner 승인 ④ 절차로만 처리.
 */
create or replace function public.community_post_image_gc_candidates(
  p_created_after timestamptz,
  p_min_age interval,
  p_limit integer
)
returns table (name text, created_at timestamptz)
language sql
stable
security definer
set search_path = public, storage
as $fn$
  with o as (
    select so.name, so.created_at
    from storage.objects so
    where so.bucket_id = 'post-images'
      and so.name ~ '^[0-9a-f-]{36}/community/(import/)?[0-9a-f-]{36}\.(webp|jpe?g|png|gif)$'
      and so.created_at >= p_created_after
      and so.created_at <= now() - p_min_age
    order by so.created_at
    limit greatest(1, least(coalesce(p_limit, 200), 500)) * 4
  )
  select o.name, o.created_at
  from o
  join public.community_post_image_unreferenced(array(select o2.name from o o2)) u on u.name = o.name
  order by o.created_at
  limit greatest(1, least(coalesce(p_limit, 200), 500));
$fn$;

/** 작성 취소·미사용 즉시 정리: 본인 폴더 · p_max_age 이내 생성 · 미참조 원본만 */
create or replace function public.community_post_image_discardable(
  p_owner uuid,
  p_names text[],
  p_max_age interval
)
returns table (name text)
language sql
stable
security definer
set search_path = public, storage
as $fn$
  with o as (
    select so.name
    from storage.objects so
    where so.bucket_id = 'post-images'
      and so.name = any (coalesce(p_names, '{}'::text[]))
      and so.name like p_owner::text || '/community/%'
      and so.name ~ '^[0-9a-f-]{36}/community/(import/)?[0-9a-f-]{36}\.(webp|jpe?g|png|gif)$'
      and so.created_at >= now() - p_max_age
  )
  select u.name
  from public.community_post_image_unreferenced(array(select o.name from o)) u;
$fn$;

revoke all on function public.community_post_image_unreferenced(text[]) from public, anon, authenticated;
revoke all on function public.community_post_image_gc_candidates(timestamptz, interval, integer) from public, anon, authenticated;
revoke all on function public.community_post_image_discardable(uuid, text[], interval) from public, anon, authenticated;
grant execute on function public.community_post_image_unreferenced(text[]) to service_role;
grant execute on function public.community_post_image_gc_candidates(timestamptz, interval, integer) to service_role;
grant execute on function public.community_post_image_discardable(uuid, text[], interval) to service_role;
