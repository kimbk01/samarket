-- 커뮤니티 Admin R4 (PR #86) 운영 DB 되돌리기 — 문제가 생겼을 때만 Owner 승인 후 실행.
-- 추가한 컬럼·테이블·인덱스는 기존 코드와 호환되므로 남겨 둔다 (데이터 보존). 동작을 바꾼 것만 원복한다.
begin;

-- M1 원복: 작성자 직접 수정·삭제 정책 (C-01 결함이 다시 열린다 — 앱 오류가 이 차단 때문일 때만)
create policy community_posts_update_own on public.community_posts
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy community_posts_delete_own on public.community_posts
  for delete to authenticated using (auth.uid() = user_id);
create policy community_comments_insert_authenticated on public.community_comments
  for insert to authenticated with check (auth.uid() = user_id);
grant insert, update, delete on public.community_posts to authenticated;
grant insert, update, delete on public.community_comments to authenticated;

-- M3 / M10 트리거 해제 (수정 이력 기록·숨김 시 고정 해제)
drop trigger if exists trg_community_posts_record_revision on public.community_posts;
drop trigger if exists trg_community_posts_clear_pin on public.community_posts;

-- M8 원복: 답글 CASCADE
alter table public.community_comments drop constraint if exists community_comments_parent_id_fkey;
alter table public.community_comments add constraint community_comments_parent_id_fkey
  foreign key (parent_id) references public.community_comments(id) on delete cascade;

commit;
-- 함수(admin_* RPC)는 서버 코드가 호출하지 않으면 영향이 없다. 웹 롤백은 Vercel 이전 배포로 되돌린다.
