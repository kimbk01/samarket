-- =============================================================================
-- M1b — 옛 모임(meetings) DB 전부 삭제 (Owner 2026-11-12 「옛 모임 모두 삭제, 신규 설계」 → 「권고안으로 진행」)
-- 설계: docs/design/moim/moim-design-v1-2026-11-12.md §1 · §10(M1b)
--
-- 적용 조건 (반드시 지킬 것):
--   1) M1a(앱 코드에서 옛 모임 참조 제거, PR #157)가 운영(Production)에 배포된 뒤에만 적용한다.
--      먼저 적용하면 운영 중인 옛 코드가 지워진 테이블·열을 읽다가 깨진다.
--   2) 운영 DB 적용은 Owner 승인 후.
--   3) 적용 직전 운영 행 수 0 재확인 (2026-11-12 조회: meetings·meeting_*·community_chat_* 0건,
--      community_posts.is_meetup=true 0건, community_topics.allow_meetup=true 0건, chat_rooms.meeting_id 0건).
--
-- 하는 일:
--   A. 옛 모임을 참조하는 운영 함수 9개를 「운영의 현재 정의」에서 해당 부분만 지워 다시 만든다.
--      (저장소 정의와 운영 정의가 다른 함수가 있어 — admin_action_queue_counts · admin_community_period_stats ·
--       get_cm_bootstrap_full_snapshot — 저장소 본문으로 덮어쓰지 않고 운영 정의를 그대로 고친다.
--       지울 부분이 예상 개수만큼 없으면 예외로 중단 → 트랜잭션 전체 롤백.)
--   B. philife_topics 뷰를 allow_meetup 없이 다시 만든다.
--   C. 옛 모임 테이블·옛 모임 채팅 엔진 테이블(community_chat_*)·함수 삭제, 관련 열 삭제.
--
-- 범위 밖 (그대로 둠): open_chat_* (옛 오픈채팅 엔진, 운영 행 있음 — 모임 아님), 저장소 post-images 의 옛 모임 사진 파일.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- A. 함수 정의에서 옛 모임 부분만 제거 (운영 현재 정의 기준, 개수 검사)
-- -----------------------------------------------------------------------------
create or replace function pg_temp.moim_m1b_strip(
  p_def text, p_pattern text, p_repl text, p_expect int, p_label text
) returns text
language plpgsql as $f$
declare
  v_n int := regexp_count(p_def, p_pattern);
begin
  if v_n <> p_expect then
    raise exception 'moim_m1b: % — expected % match(es), found %', p_label, p_expect, v_n;
  end if;
  return regexp_replace(p_def, p_pattern, p_repl, 'g');
end
$f$;

do $m1b$
declare
  d text;
begin
  -- A1. 어드민 처리 대기열 집계: meeting_reports 블록 제거
  d := pg_get_functiondef('public.admin_action_queue_counts(jsonb)'::regprocedure);
  d := pg_temp.moim_m1b_strip(d,
    'begin select count\(\*\) into v from public\.meeting_reports t .*?''meeting_reports'', null\); end; ',
    '', 1, 'admin_action_queue_counts.meeting_reports');
  execute d;

  -- A2. 커뮤니티 감사 대상 타입: meeting_report · meeting 제거
  d := pg_get_functiondef('public.admin_community_is_audit_target(text)'::regprocedure);
  d := pg_temp.moim_m1b_strip(d, '''community_report'', ''meeting_report'',', '''community_report'',', 1, 'audit_target.meeting_report');
  d := pg_temp.moim_m1b_strip(d, '''community_settings'', ''meeting'', ', '''community_settings'', ', 1, 'audit_target.meeting');
  execute d;

  -- A3. 커뮤니티 기간 통계: meeting_in / meeting_done CTE 와 meeting_received / meeting_processed 키 제거
  d := pg_get_functiondef('public.admin_community_period_stats(timestamp with time zone, timestamp with time zone)'::regprocedure);
  d := pg_temp.moim_m1b_strip(d, '\n[ \t]*meeting_in as \([^\n]*', '', 1, 'period_stats.meeting_in');
  d := pg_temp.moim_m1b_strip(d, '\n[ \t]*meeting_done as \([^\n]*', '', 1, 'period_stats.meeting_done');
  d := pg_temp.moim_m1b_strip(d,
    ',\s*''meeting_received'', \(select count\(\*\) from meeting_in\), ''meeting_processed'', \(select count\(\*\) from meeting_done\)\)',
    ')', 1, 'period_stats.meeting_keys');
  execute d;

  -- A4. 외부 글 가져오기 발행: is_meetup · meetup_place · meetup_date 열·값 제거
  d := pg_get_functiondef('public.community_import_publish(jsonb)'::regprocedure);
  d := pg_temp.moim_m1b_strip(d, 'is_question, is_meetup, meetup_place, meetup_date,', 'is_question,', 1, 'import_publish.cols');
  d := pg_temp.moim_m1b_strip(d, 'v_images, false, false, null, null,', 'v_images, false,', 1, 'import_publish.values');
  execute d;

  -- A5. 사진 정리(GC) 참조 목록: 옛 모임 9줄 + 옛 모임 채팅 엔진(community_chat_*) 3줄 제거
  d := pg_get_functiondef('public.community_post_image_unreferenced(text[])'::regprocedure);
  d := pg_temp.moim_m1b_strip(d, '\n[ \t]*union all select [^\n]* from public\.meeting[a-z_]*', '', 9, 'image_gc.meeting');
  d := pg_temp.moim_m1b_strip(d, '\n[ \t]*union all select [^\n]* from public\.community_chat_[a-z_]+', '', 3, 'image_gc.community_chat');
  execute d;

  -- A6. 게시글 광고용 커뮤니티 글 생성: is_meetup 열·값 제거
  d := pg_get_functiondef('public.ensure_community_post_for_post_ads(uuid, uuid)'::regprocedure);
  d := pg_temp.moim_m1b_strip(d, 'is_question,\s*\n[ \t]*is_meetup,', 'is_question,', 1, 'post_ads.cols');
  d := pg_temp.moim_m1b_strip(d, 'false,(\s*)false,(\s*)''active'',', 'false,\2''active'',', 1, 'post_ads.values');
  execute d;

  -- A7. 메신저 전체 부트스트랩 스냅샷: meetings CTE · 'meetings' 키 제거 (앱은 M1a 부터 이 키를 읽지 않음)
  d := pg_get_functiondef('public.get_cm_bootstrap_full_snapshot(uuid, text, integer, text)'::regprocedure);
  d := pg_temp.moim_m1b_strip(d,
    '\n[ \t]*meetings AS \(\n[ \t]*SELECT coalesce\(.*?FROM public\.meetings m.*?\n[ \t]*\),(\n[ \t]*all_user_ids AS \()',
    '\1', 1, 'cm_snapshot.meetings_cte');
  d := pg_temp.moim_m1b_strip(d, '\n[ \t]*''meetings'', \(SELECT rows FROM meetings\),', '', 1, 'cm_snapshot.meetings_key');
  execute d;

  -- A8. 피드 주제 목록 (philife / 옛 철자 philify): t.allow_meetup 선택 제거
  d := pg_get_functiondef('public.philife_list_default_section_topics_for_feed()'::regprocedure);
  d := pg_temp.moim_m1b_strip(d, '\n[ \t]*t\.allow_meetup,\r?', '', 1, 'philife_topics_for_feed');
  execute d;

  d := pg_get_functiondef('public.philify_list_default_section_topics_for_feed()'::regprocedure);
  d := pg_temp.moim_m1b_strip(d, '\n[ \t]*t\.allow_meetup,\r?', '', 1, 'philify_topics_for_feed');
  execute d;
end
$m1b$;

-- 남은 참조가 없어야 한다 (함수 본문 검사)
do $chk$
declare
  v_left text;
begin
  select string_agg(p.oid::regprocedure::text, ', ') into v_left
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'admin_action_queue_counts', 'admin_community_is_audit_target', 'admin_community_period_stats',
      'community_import_publish', 'community_post_image_unreferenced', 'ensure_community_post_for_post_ads',
      'get_cm_bootstrap_full_snapshot', 'philife_list_default_section_topics_for_feed',
      'philify_list_default_section_topics_for_feed')
    and (p.prosrc ~* 'meeting|meetup' or p.prosrc ~* 'community_chat_(messages|rooms)');
  if v_left is not null then
    raise exception 'moim_m1b: functions still reference legacy meetings: %', v_left;
  end if;
end
$chk$;

-- -----------------------------------------------------------------------------
-- B. philife_topics 뷰 (allow_meetup 제외, 기존 옵션·권한 유지)
-- -----------------------------------------------------------------------------
drop view if exists public.philife_topics;
create view public.philife_topics with (security_invoker = true) as
  select id, section_id, name, slug, icon, color, sort_order, is_active, is_visible,
         allow_question, is_feed_sort, created_at, updated_at, feed_list_skin
  from public.community_topics;
grant all on public.philife_topics to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- C. 열 · 테이블 · 함수 삭제
-- -----------------------------------------------------------------------------
-- 옛 거래 채팅 테이블의 모임 연결 열 (FK · 인덱스 3개 함께 삭제)
alter table public.chat_rooms drop column if exists meeting_id;

-- 옛 모임 테이블 (트리거·정책은 테이블과 함께 삭제)
drop table if exists
  public.meeting_open_chat_logs,
  public.meeting_open_chat_notices,
  public.meeting_open_chat_bans,
  public.meeting_open_chat_reports,
  public.meeting_open_chat_join_requests,
  public.meeting_open_chat_attachments,
  public.meeting_open_chat_messages,
  public.meeting_open_chat_members,
  public.meeting_open_chat_rooms,
  public.meeting_chat_participants,
  public.meeting_chat_rooms,
  public.meeting_join_answers,
  public.meeting_join_questions,
  public.meeting_feed_comments,
  public.meeting_feed_images,
  public.meeting_feed_posts,
  public.meeting_album_items,
  public.meeting_reports,
  public.meeting_action_logs,
  public.meeting_events,
  public.meeting_notices,
  public.meeting_member_bans,
  public.meeting_join_requests,
  public.meeting_members,
  public._samarket_meeting_cm_backfill_work
  cascade;

-- 옛 모임 오픈채팅 엔진 (20260531150000_community_meeting_open_chat_engine) — 운영 0건
drop table if exists
  public.community_chat_logs,
  public.community_chat_join_requests,
  public.community_chat_notices,
  public.community_chat_bans,
  public.community_chat_reports,
  public.community_chat_message_attachments,
  public.community_chat_messages,
  public.community_chat_room_members,
  public.community_chat_rooms
  cascade;

drop table if exists public.meetings cascade;

drop function if exists public.can_manage_meeting(uuid, uuid);
drop function if exists public.has_joined_meeting_member(uuid, uuid);
drop function if exists public.refresh_meeting_room_stats(uuid);
drop function if exists public.sync_meeting_chat_participant(uuid, uuid, text);
drop function if exists public.after_meeting_member_bans_changed();
drop function if exists public.after_meeting_members_changed();
drop function if exists public.after_meeting_notices_changed();
drop function if exists public.enforce_meeting_member_cap();
drop function if exists public.log_meeting_member_attendance_event();
drop function if exists public.log_meeting_member_status_event();
drop function if exists public.log_meeting_notice_event();
drop function if exists public.meeting_members_apply_defaults();
drop function if exists public.meetings_sync_closed_legacy();
drop function if exists public.meetings_sync_room_policy_legacy();
drop function if exists public.touch_meeting_room_timestamp();
drop function if exists public.admin_community_meetings_page(text, text, text, uuid, integer, integer);
drop function if exists public.admin_meeting_reports_page(jsonb, text, text, timestamp with time zone, timestamp with time zone, text, integer, integer);

-- 커뮤니티 글 · 주제의 옛 모임 열
alter table public.community_posts
  drop column if exists is_meetup,
  drop column if exists meetup_place,
  drop column if exists meetup_date;
alter table public.community_topics drop column if exists allow_meetup;

commit;
