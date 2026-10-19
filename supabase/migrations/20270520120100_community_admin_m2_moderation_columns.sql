-- 커뮤니티 Admin M2: 누가·언제·왜 숨김/삭제했는지, 마지막으로 누가 고쳤는지 기록.
alter table public.community_posts
  add column if not exists moderated_by uuid,
  add column if not exists moderated_at timestamptz,
  add column if not exists moderation_reason text,
  add column if not exists last_edited_by uuid,
  add column if not exists last_edited_role text,
  add column if not exists last_edit_reason text,
  add column if not exists last_admin_edit_at timestamptz;

alter table public.community_posts drop constraint if exists community_posts_last_edited_role_check;
alter table public.community_posts add constraint community_posts_last_edited_role_check
  check (last_edited_role is null or last_edited_role in ('author', 'admin', 'system'));

alter table public.community_comments
  add column if not exists moderated_by uuid,
  add column if not exists moderated_at timestamptz,
  add column if not exists moderation_reason text;
