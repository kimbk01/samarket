-- 커뮤니티 Admin M3 (C-07): 게시글 수정 이력. 제목·본문·블록·카테고리가 바뀌면 바뀌기 전 값을 남긴다.
-- 수정한 사람은 같은 UPDATE 에 실린 last_edited_by / last_edited_role 로 기록 (작성자·관리자 구분).
-- 게시글을 영구 삭제해도 이력은 남도록 FK 를 두지 않는다 (신고 증거 보존).
create table if not exists public.community_post_revisions (
  id bigserial primary key,
  post_id uuid not null,
  editor_id uuid,
  editor_role text not null default 'system',
  title text,
  content text,
  content_blocks jsonb,
  topic_id uuid,
  topic_slug text,
  reason text,
  created_at timestamptz not null default now()
);
create index if not exists idx_community_post_revisions_post
  on public.community_post_revisions (post_id, created_at desc);

alter table public.community_post_revisions enable row level security;
revoke all on public.community_post_revisions from anon, authenticated;

create or replace function public.community_posts_record_revision()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (old.title is distinct from new.title)
     or (old.content is distinct from new.content)
     or (old.content_blocks is distinct from new.content_blocks)
     or (old.topic_id is distinct from new.topic_id) then
    insert into public.community_post_revisions
      (post_id, editor_id, editor_role, title, content, content_blocks, topic_id, topic_slug, reason)
    values
      (old.id, new.last_edited_by, coalesce(new.last_edited_role, 'system'),
       old.title, old.content, old.content_blocks, old.topic_id, old.topic_slug, new.last_edit_reason);
    if new.last_edited_role = 'admin' then
      new.last_admin_edit_at := now();
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_community_posts_record_revision on public.community_posts;
create trigger trg_community_posts_record_revision
  before update on public.community_posts
  for each row execute function public.community_posts_record_revision();
