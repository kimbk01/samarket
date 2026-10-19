-- DIBAY 운영 DB (kimbk01's Project · ckdosyydvgzqwpbwuhon) — 커뮤니티 Admin 승인 필요 문장
-- 선행: Claude 가 A(추가 전용)를 먼저 적용한다. 이 파일은 Supabase SQL Editor 에서 한 번 실행한다.
-- 한 트랜잭션: 중간 오류 시 전체 취소. 재실행 안전.
begin;

-- M1 (C-01 P0): 작성자 PostgREST 직접 수정·삭제 차단 (앱 쓰기는 모두 서버 API)
drop policy if exists community_posts_update_own on public.community_posts;
drop policy if exists community_posts_delete_own on public.community_posts;
drop policy if exists community_comments_insert_authenticated on public.community_comments;
revoke insert, update, delete on public.community_posts from anon, authenticated;
revoke insert, update, delete on public.community_comments from anon, authenticated;

-- M3: 수정 이력은 서버 전용
revoke all on public.community_post_revisions from anon, authenticated;

-- M4: 게시글 영구 삭제 시 신고 기록이 함께 지워지던 레거시 FK 제거
alter table public.community_reports drop constraint if exists community_reports_post_id_fkey;

-- M5: 제재 종류에 커뮤니티 활동 제한 추가
alter table public.sanctions drop constraint if exists sanctions_sanction_type_check;
alter table public.sanctions add constraint sanctions_sanction_type_check
  check (sanction_type in ('warning', 'chat_ban', 'temp_suspend', 'permanent_ban', 'community_restriction'));

-- M8: 부모 댓글 행 삭제 시 답글 보존
alter table public.community_comments drop constraint if exists community_comments_parent_id_fkey;
alter table public.community_comments
  add constraint community_comments_parent_id_fkey
  foreign key (parent_id) references public.community_comments(id) on delete set null;

-- 새 함수: 서버(service_role)만 실행
revoke all on function public.admin_apply_community_sanction(uuid, text, text, integer, text, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.admin_revoke_community_sanction(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.approve_user_point_charge_request_verified(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.admin_adjust_user_points(uuid, integer, text, uuid, text) from public, anon, authenticated;
revoke all on function public.admin_promotion_pause(uuid, uuid) from public, anon, authenticated;
revoke all on function public.admin_promotion_resume(uuid, uuid) from public, anon, authenticated;
revoke all on function public.admin_promotion_end(uuid, uuid, text, text, text, boolean) from public, anon, authenticated;
revoke all on function public.admin_set_community_post_pin(uuid, uuid, text, timestamptz, integer, text) from public, anon, authenticated;
revoke all on function public.admin_community_report_decide(uuid, text, text, uuid, text, text, text, text, integer, boolean) from public, anon, authenticated;
revoke all on function public.admin_community_is_audit_target(text) from public, anon, authenticated;
revoke all on function public.admin_community_members(text, boolean, text, text, integer, integer, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.admin_community_period_stats(timestamptz, timestamptz) from public, anon, authenticated;

-- Owner 결정: 명시 권한 행이 있는 활성 운영자에게 ads 추가 (현재 대상 0명 — 기본 권한으로 적용)
update public.admin_staff_permissions p
   set permissions = p.permissions || '["ads"]'::jsonb, updated_at = now()
  from public.admin_memberships m
 where m.user_id = p.user_id and m.status = 'active' and m.role = 'admin'
   and jsonb_typeof(p.permissions) = 'array' and not (p.permissions ? 'ads');

commit;
