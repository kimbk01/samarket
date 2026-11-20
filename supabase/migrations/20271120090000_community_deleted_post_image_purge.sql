-- 라운지 삭제 글 사진 30일 뒤 삭제 (Owner 2026-11-20 「30일 뒤 삭제」)
-- 감사: docs/audit/lounge-paste-images-2026-11-20.md §11 O2
--
-- 원인 (운영 조회 2026-11-20, 읽기 전용):
--   · 고아 사진 정리(community_post_image_unreferenced)는 삭제된 글도 「참조 중」으로 본다 → 삭제 글 사진은 영구 보관(삭제 글 29건·사진 51장).
--   · 삭제 시각을 남기는 열이 없다. 회원 삭제는 status 만 바꾸고 updated_at 을 바꾸지 않으며, updated_at 자동 갱신 트리거도 없다
--     → 관리자 영구 삭제(bulk-delete)의 「삭제 뒤 30일」 판정(updated_at)도 실제 삭제 시각이 아니다.
-- 수정:
--   ① deleted_at: 삭제 상태가 되는 순간 now(), 복구되면 null (트리거). 기존 삭제 글은 삭제 시각을 알 수 없어 이 마이그레이션 시각으로 채운다
--     (= 기존 삭제 글 사진은 지금부터 30일 뒤 정리 — 더 일찍 지우지 않는 쪽).
--   ② deleted_images_purged_at: 사진 정리를 끝낸 글 표시(매일 다시 처리하지 않음). 복구되면 null.
--   ③ community_post_image_unreferenced_excluding_posts(p_names, p_exclude_post_ids): 참조 판정에서 주어진 글(본문·사진 열·첨부 표·수정 기록)만 뺀다.
--     기존 community_post_image_unreferenced 는 빈 목록으로 이 함수를 부른다 — 참조 열 목록은 한 곳(아래)만 유지. 판정 결과는 기존과 같다.
--   참조 열 목록은 운영 현재 정의(pg_get_functiondef, 2026-11-20 조회 — 20271114230000 과 동일 50줄) 그대로.

alter table public.community_posts add column if not exists deleted_at timestamptz;
alter table public.community_posts add column if not exists deleted_images_purged_at timestamptz;

comment on column public.community_posts.deleted_at is '삭제 상태가 된 시각(트리거). 복구되면 null. 삭제 뒤 30일 판정 기준';
comment on column public.community_posts.deleted_images_purged_at is '삭제 30일 뒤 사진 정리를 끝낸 시각(매일 정리 작업). 복구되면 null';

create or replace function public.community_posts_track_deleted_at()
returns trigger
language plpgsql
set search_path = public
as $fn$
begin
  if new.status = 'deleted' or coalesce(new.is_deleted, false) then
    if new.deleted_at is null then
      new.deleted_at := now();
    end if;
  else
    new.deleted_at := null;
    new.deleted_images_purged_at := null;
  end if;
  return new;
end;
$fn$;

drop trigger if exists trg_community_posts_track_deleted_at on public.community_posts;
create trigger trg_community_posts_track_deleted_at
  before insert or update of status, is_deleted on public.community_posts
  for each row execute function public.community_posts_track_deleted_at();

update public.community_posts
   set deleted_at = now()
 where (status = 'deleted' or coalesce(is_deleted, false))
   and deleted_at is null;

create index if not exists community_posts_deleted_purge_due_idx
  on public.community_posts (deleted_at)
  where status = 'deleted' and deleted_images_purged_at is null;

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

revoke all on function public.community_post_image_unreferenced_excluding_posts(text[], uuid[]) from public, anon, authenticated;
grant execute on function public.community_post_image_unreferenced_excluding_posts(text[], uuid[]) to service_role;

-- 기존 함수는 빈 제외 목록으로 위 함수를 부른다(시그니처·권한·결과 불변, 다른 함수 gc_candidates·discardable 가 그대로 부름)
create or replace function public.community_post_image_unreferenced(p_names text[])
returns table (name text)
language sql
stable
security definer
set search_path = public
as $fn$
  select u.name from public.community_post_image_unreferenced_excluding_posts(p_names, '{}'::uuid[]) as u;
$fn$;

revoke all on function public.community_post_image_unreferenced(text[]) from public, anon, authenticated;
grant execute on function public.community_post_image_unreferenced(text[]) to service_role;
