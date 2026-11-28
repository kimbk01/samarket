-- 롤백: supabase/migrations/20271128230000_lounge_comments_ssot.sql
-- 앱 코드(묶음 B·D)를 먼저 되돌린 뒤 적용한다. 새 칸에 쌓인 고정·수정 시각은 사라진다.
drop function if exists public.community_comment_pin_set(uuid, uuid, boolean);
drop function if exists public.community_comment_like_set(uuid, uuid, boolean);
drop trigger if exists trg_community_comments_unpin_when_removed on public.community_comments;
drop function if exists public.community_comments__unpin_when_removed();
drop index if exists public.community_comments_one_pin_per_post;
alter table public.community_comments drop column if exists pinned_by;
alter table public.community_comments drop column if exists pinned_at;
alter table public.community_comments drop column if exists edited_at;
