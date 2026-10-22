-- 커뮤니티 재감사 묶음 1 (CM-P1-01): 공감·댓글 수 중복 집계 제거 + 1회 재계산.
-- 운영 실측(2026-10-22): community_post_likes 트리거 3개(bump·count(저장소 밖 수동 생성)·sync) → 공감 1회 +3,
-- community_comments 트리거 2개 → 댓글 1개 +2, 소프트 삭제(status)는 감소하지 않음.
-- 이후 SSOT: 공감 = trg_community_post_likes_count(sync_community_post_like_count) 하나,
--           댓글 = trg_community_comments_count(sync_community_post_comment_count) 하나(보이는 댓글만 집계).

drop trigger if exists tr_community_post_likes_bump on public.community_post_likes;
drop trigger if exists tr_community_post_likes_count on public.community_post_likes;
drop trigger if exists tr_community_comments_bump on public.community_comments;

-- 보이는 댓글 = status active · 숨김 아님 · 삭제 아님 (회원 화면 노출 규칙과 동일)
create or replace function public.sync_community_post_comment_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  vis_old boolean := false;
  vis_new boolean := false;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    vis_old := coalesce(old.status, 'active') = 'active'
      and coalesce(old.is_hidden, false) = false
      and coalesce(old.is_deleted, false) = false;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    vis_new := coalesce(new.status, 'active') = 'active'
      and coalesce(new.is_hidden, false) = false
      and coalesce(new.is_deleted, false) = false;
  end if;

  if tg_op = 'INSERT' then
    if vis_new then
      update public.community_posts set comment_count = coalesce(comment_count, 0) + 1 where id = new.post_id;
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    if vis_old then
      update public.community_posts set comment_count = greatest(0, coalesce(comment_count, 0) - 1) where id = old.post_id;
    end if;
    return old;
  else
    if vis_old and not vis_new then
      update public.community_posts set comment_count = greatest(0, coalesce(comment_count, 0) - 1) where id = new.post_id;
    elsif vis_new and not vis_old then
      update public.community_posts set comment_count = coalesce(comment_count, 0) + 1 where id = new.post_id;
    end if;
    return new;
  end if;
end;
$$;

drop trigger if exists trg_community_comments_count on public.community_comments;
create trigger trg_community_comments_count
  after insert or delete or update of status, is_hidden, is_deleted on public.community_comments
  for each row execute function public.sync_community_post_comment_count();

-- 1회 재계산 — 집계 컬럼만 갱신(본문·상태·updated_at 불변). 운영 실측 영향: 공감 9개 글, 댓글 9개 글.
update public.community_posts p
   set like_count = s.cnt
  from (
    select p2.id, (select count(*) from public.community_post_likes l where l.post_id = p2.id)::int as cnt
      from public.community_posts p2
  ) s
 where s.id = p.id and p.like_count is distinct from s.cnt;

update public.community_posts p
   set comment_count = s.cnt
  from (
    select p2.id,
           (select count(*) from public.community_comments c
             where c.post_id = p2.id
               and coalesce(c.status, 'active') = 'active'
               and coalesce(c.is_hidden, false) = false
               and coalesce(c.is_deleted, false) = false)::int as cnt
      from public.community_posts p2
  ) s
 where s.id = p.id and p.comment_count is distinct from s.cnt;
