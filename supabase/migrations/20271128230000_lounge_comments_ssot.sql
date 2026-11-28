-- 라운지 댓글 SSOT 묶음 A (감사 L5·L6·L11 · Owner 「권장안대로 승인」 2026-11-28)
-- 설계: docs/audit/lounge-comments-2026-11-28/lounge-comments-audit-design.md §6.3
-- 롤백: docs/audit/lounge-comments-2026-11-28/rollback-20271128230000.sql
-- 새 칸·새 함수·새 트리거만 추가한다. 기존 함수·트리거·데이터 의미는 바꾸지 않는다(edited_at 1회 채움 제외).
-- 함수 본문에는 비 ASCII 주석을 넣지 않는다 (운영 적용 도구가 멈춤).

-- L5: author body edit time (admin moderation keeps updated_at only)
alter table public.community_comments add column if not exists edited_at timestamptz;

-- backfill: visible rows the author edited before this change (no moderation stamp).
-- status changes also bump updated_at (legacy flag trigger), so only active rows are considered.
update public.community_comments
   set edited_at = updated_at
 where edited_at is null
   and moderated_at is null
   and coalesce(status, 'active') = 'active'
   and coalesce(is_hidden, false) = false
   and coalesce(is_deleted, false) = false
   and updated_at > created_at + interval '2 seconds';

-- L11 decision 1: one pinned comment per post, pinned by the post author
alter table public.community_comments add column if not exists pinned_at timestamptz;
-- no FK (same as moderated_by): a post author without a profiles row must still be able to pin
alter table public.community_comments add column if not exists pinned_by uuid;
create unique index if not exists community_comments_one_pin_per_post
  on public.community_comments (post_id) where pinned_at is not null;

create or replace function public.community_comments__unpin_when_removed()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
begin
  if new.pinned_at is not null and (
       coalesce(new.status, 'active') <> 'active'
       or coalesce(new.is_hidden, false)
       or coalesce(new.is_deleted, false)) then
    new.pinned_at := null;
    new.pinned_by := null;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_community_comments_unpin_when_removed on public.community_comments;
create trigger trg_community_comments_unpin_when_removed
  before update of status, is_hidden, is_deleted on public.community_comments
  for each row execute function public.community_comments__unpin_when_removed();

-- L6: like = desired state (idempotent), count recomputed under row lock
create or replace function public.community_comment_like_set(p_comment_id uuid, p_user_id uuid, p_liked boolean)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_c record;
  v_count integer;
begin
  if (select auth.role()) is distinct from 'service_role' then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if p_comment_id is null or p_user_id is null or p_liked is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_request');
  end if;

  select id, status, is_hidden, is_deleted into v_c
    from public.community_comments where id = p_comment_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'comment_not_found');
  end if;

  if p_liked then
    if coalesce(v_c.status, 'active') <> 'active' or coalesce(v_c.is_hidden, false) or coalesce(v_c.is_deleted, false) then
      return jsonb_build_object('ok', false, 'error', 'comment_not_likeable');
    end if;
    insert into public.community_comment_likes (comment_id, user_id)
    values (p_comment_id, p_user_id)
    on conflict (comment_id, user_id) do nothing;
  else
    delete from public.community_comment_likes where comment_id = p_comment_id and user_id = p_user_id;
  end if;

  select count(*) into v_count from public.community_comment_likes where comment_id = p_comment_id;
  update public.community_comments set like_count = v_count where id = p_comment_id;

  return jsonb_build_object('ok', true, 'liked', p_liked, 'like_count', v_count);
end;
$function$;

-- L11 decision 1: pin / unpin (post author only, visible top-level comment on a visible post)
create or replace function public.community_comment_pin_set(p_comment_id uuid, p_actor_id uuid, p_pinned boolean)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_c record;
  v_p record;
begin
  if (select auth.role()) is distinct from 'service_role' then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if p_comment_id is null or p_actor_id is null or p_pinned is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_request');
  end if;

  select id, post_id, parent_id, status, is_hidden, is_deleted, pinned_at into v_c
    from public.community_comments where id = p_comment_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'comment_not_found');
  end if;

  select id, user_id, status, is_hidden into v_p
    from public.community_posts where id = v_c.post_id for update;
  if not found or coalesce(v_p.status, 'active') = 'deleted' or coalesce(v_p.is_hidden, false) then
    return jsonb_build_object('ok', false, 'error', 'post_not_found');
  end if;
  if v_p.user_id is distinct from p_actor_id then
    return jsonb_build_object('ok', false, 'error', 'comment_pin_not_post_author');
  end if;

  if p_pinned then
    if v_c.parent_id is not null
       or coalesce(v_c.status, 'active') <> 'active' or coalesce(v_c.is_hidden, false) or coalesce(v_c.is_deleted, false) then
      return jsonb_build_object('ok', false, 'error', 'comment_not_pinnable');
    end if;
    update public.community_comments
       set pinned_at = null, pinned_by = null
     where post_id = v_c.post_id and pinned_at is not null and id <> p_comment_id;
    update public.community_comments
       set pinned_at = now(), pinned_by = p_actor_id
     where id = p_comment_id;
  else
    update public.community_comments
       set pinned_at = null, pinned_by = null
     where id = p_comment_id;
  end if;

  return jsonb_build_object('ok', true, 'pinned', p_pinned, 'post_id', v_c.post_id);
end;
$function$;

revoke all on function public.community_comment_like_set(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.community_comment_pin_set(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.community_comment_like_set(uuid, uuid, boolean) to service_role;
grant execute on function public.community_comment_pin_set(uuid, uuid, boolean) to service_role;
