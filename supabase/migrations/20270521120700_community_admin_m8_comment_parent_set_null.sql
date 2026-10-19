-- 커뮤니티 Admin M8 (C-26): 부모 댓글 행이 지워져도 답글이 함께 지워지지 않게.
alter table public.community_comments drop constraint if exists community_comments_parent_id_fkey;
alter table public.community_comments
  add constraint community_comments_parent_id_fkey
  foreign key (parent_id) references public.community_comments(id) on delete set null;
