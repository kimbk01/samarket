-- =============================================================================
-- 전체 모임 데이터 초기화 (레거시 + 현재 스택 무관 일괄 삭제)
-- - community_posts.is_meetup = true 인 글(모임 게시글) 삭제 → meetings CASCADE
-- - meetings에만 남은 고아 행(있다면) 삭제
-- - meetings.community_messenger_room_id 로 연결된 메신저 방·메시지·참가자 정리
-- - meetings.chat_room_id / meeting_chat_rooms.linked_chat_room_id 의 레거시 chat_rooms 정리
-- community_chat_* / meeting_open_chat_* 는 meetings 삭제 시 CASCADE 되므로,
--   community_posts 삭제 전에 막는 FK(meeting_reports 등)만 선삭제합니다.
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1) meetings 삭제를 막는 NO ACTION / SET NULL 이 아닌 자식·로그
-- ---------------------------------------------------------------------------
delete from public.meeting_reports where meeting_id is not null;
delete from public.meeting_action_logs where meeting_id is not null;

-- ---------------------------------------------------------------------------
-- 2) Community-meeting 전용 오픈채팅 엔진 (테이블이 있을 때만)
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.community_chat_messages') is not null then
    delete from public.community_chat_messages;
  end if;
  if to_regclass('public.community_chat_room_members') is not null then
    delete from public.community_chat_room_members;
  end if;
  if to_regclass('public.community_chat_rooms') is not null then
    delete from public.community_chat_rooms;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3) meetings → community_messenger 방 (FK: meetings → rooms ON DELETE SET NULL 이므로 방을 직접 삭제)
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.community_messenger_messages') is not null then
    delete from public.community_messenger_messages m
    using public.meetings t
    where t.community_messenger_room_id is not null
      and m.room_id = t.community_messenger_room_id;
  end if;
  if to_regclass('public.community_messenger_call_logs') is not null then
    delete from public.community_messenger_call_logs c
    using public.meetings t
    where t.community_messenger_room_id is not null
      and c.room_id = t.community_messenger_room_id;
  end if;
  if to_regclass('public.community_messenger_room_profiles') is not null then
    delete from public.community_messenger_room_profiles p
    using public.meetings t
    where t.community_messenger_room_id is not null
      and p.room_id = t.community_messenger_room_id;
  end if;
  if to_regclass('public.community_messenger_participants') is not null then
    delete from public.community_messenger_participants p
    using public.meetings t
    where t.community_messenger_room_id is not null
      and p.room_id = t.community_messenger_room_id;
  end if;
  if to_regclass('public.community_messenger_rooms') is not null then
    delete from public.community_messenger_rooms r
    using public.meetings t
    where t.community_messenger_room_id is not null
      and r.id = t.community_messenger_room_id;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4) meeting_chat_rooms 가 가리키는 부가 chat_rooms (행 삭제 시 mcr·메시지 등 CASCADE 에 맡김)
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.chat_rooms') is not null
     and to_regclass('public.meeting_chat_rooms') is not null then
    delete from public.chat_rooms cr
    using public.meeting_chat_rooms mcr
    where cr.id = mcr.linked_chat_room_id;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 5) 모임 기본 그룹채팅 (meetings.chat_room_id) — id 목록은 WITH 로 한 번만 고정
-- ---------------------------------------------------------------------------
with ids as (
  select distinct t.chat_room_id as cid
  from public.meetings t
  where t.chat_room_id is not null
),
del_msg as (
  delete from public.chat_messages m
  where m.room_id in (select cid from ids where cid is not null)
  returning 1
),
del_part as (
  delete from public.chat_room_participants p
  where p.room_id in (select cid from ids where cid is not null)
  returning 1
),
clr as (
  update public.meetings t
  set chat_room_id = null
  where t.chat_room_id in (select cid from ids where cid is not null)
  returning 1
),
del_room as (
  delete from public.chat_rooms cr
  where cr.id in (select cid from ids where cid is not null)
  returning 1
)
select 1;

-- ---------------------------------------------------------------------------
-- 6) 모임 커뮤니티 글 삭제 → meetings 및 CASCADE 자식 전부 제거
-- ---------------------------------------------------------------------------
delete from public.community_posts where is_meetup = true;

-- ---------------------------------------------------------------------------
-- 7) 고아 meetings (post 가 이미 없는 경우)
-- ---------------------------------------------------------------------------
delete from public.meetings m
where not exists (
  select 1 from public.community_posts p where p.id = m.post_id
);

commit;
