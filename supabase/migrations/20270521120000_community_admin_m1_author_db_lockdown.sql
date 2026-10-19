-- 커뮤니티 Admin M1 (C-01 P0): 작성자가 PostgREST 로 직접 게시글·댓글을 바꾸거나 지우는 경로를 닫는다.
-- 앱의 작성·수정·삭제는 모두 서버 API(service role)를 거치므로 영향 없음 (클라이언트 직접 쓰기 0건 확인).
-- 관리자 숨김 해제·신고 수 조작·신고된 글 영구 삭제(증거 소멸)를 DB 층에서 차단한다.

drop policy if exists community_posts_update_own on public.community_posts;
drop policy if exists community_posts_delete_own on public.community_posts;
drop policy if exists community_comments_insert_authenticated on public.community_comments;

revoke insert, update, delete on public.community_posts from anon, authenticated;
revoke insert, update, delete on public.community_comments from anon, authenticated;
