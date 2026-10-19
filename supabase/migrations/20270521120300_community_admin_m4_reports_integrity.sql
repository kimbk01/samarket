-- 커뮤니티 Admin M4 (C-15, C-02): 피드 신고 무결성.
-- 1) 레거시 post_id FK 의 ON DELETE CASCADE 제거 — 게시글이 지워져도 신고 기록은 남는다.
-- 2) 상태·대상 CHECK, 3) 같은 회원이 같은 대상을 두 번 신고하지 못하게 unique (운영 중복 0 확인).
-- 4) 처리자·결정 사유·실행한 조치 기록.
alter table public.community_reports drop constraint if exists community_reports_post_id_fkey;

alter table public.community_reports
  add column if not exists processed_by uuid,
  add column if not exists decision_reason text,
  add column if not exists resolution_actions jsonb;

alter table public.community_reports drop constraint if exists community_reports_status_check;
alter table public.community_reports add constraint community_reports_status_check
  check (status in ('open', 'reviewing', 'resolved', 'dismissed'));

alter table public.community_reports drop constraint if exists community_reports_target_type_check;
alter table public.community_reports add constraint community_reports_target_type_check
  check (target_type is null or target_type in ('post', 'comment', 'user'));

create unique index if not exists uq_community_reports_reporter_target
  on public.community_reports (target_type, target_id, user_id)
  where user_id is not null and target_id is not null;

create index if not exists idx_community_reports_target
  on public.community_reports (target_type, target_id, status);
