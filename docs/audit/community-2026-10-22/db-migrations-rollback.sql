-- 롤백 SQL — 재감사 묶음 1·4 마이그레이션 (운영 적용 후 문제 시에만, Owner 승인 후 실행)

-- [묶음 4] 20270607100100 → m4b 원본으로 되돌림
--   supabase/migrations/20270521121000_community_admin_m4b_report_decide.sql 를 그대로 다시 실행한다.

-- [묶음 1] 20270607100000 → 적용 전 상태로 되돌림
--   1) 삭제한 트리거 재생성 (적용 전 운영과 동일 — 중복 집계가 다시 생기므로 긴급 시에만)
--   create trigger tr_community_post_likes_bump after insert or delete on public.community_post_likes
--     for each row execute function public.community_post_bump_like_count();
--   create trigger tr_community_post_likes_count after insert or delete on public.community_post_likes
--     for each row execute function public.community_likes_bump_count();
--   create trigger tr_community_comments_bump after insert or delete on public.community_comments
--     for each row execute function public.community_post_bump_comment_count();
--   2) 댓글 집계 함수 원복: 적용 직전 `select prosrc from pg_proc where proname='sync_community_post_comment_count'`
--      결과를 보관해 두고 create or replace 로 복원 (운영 원본은 is_hidden 만 판정).
--   3) 재계산된 like_count / comment_count 는 원래 값이 부풀려진 값이므로 되돌리지 않는다.
--      필요하면 적용 직전 스냅샷(아래)으로 복원:
--      create table if not exists public._bak_community_post_counts_20271022 as
--        select id, like_count, comment_count from public.community_posts;
