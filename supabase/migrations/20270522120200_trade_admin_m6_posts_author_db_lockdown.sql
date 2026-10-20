-- 거래 Admin M6 (D-04 P0, 설계 v2 §F-1-2): 판매자가 PostgREST 로 거래글을 직접 바꾸거나 지우는 경로를 닫는다.
-- 앱의 작성·수정·판매 단계·숨김·삭제는 모두 서버 API(service role)를 거친다 (브라우저 직접 쓰기 0건 확인:
-- 유일한 브라우저 쓰기였던 관리자 「끌올」은 이번 변경에서 제거). 커뮤니티 M1 과 같은 방식.
-- 막는 것: 관리자 숨김 해제, 조회·찜·채팅 수 조작, 구매자 지정 위조, 신고된 글 영구 삭제(증거 소멸).

drop policy if exists posts_update_own on public.posts;
drop policy if exists posts_delete_own on public.posts;
drop policy if exists posts_insert_own on public.posts;

revoke insert, update, delete, truncate on public.posts from anon, authenticated;
