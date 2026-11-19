-- 2026-11-19 재감사 C (Owner 「C·D 진행」) — D2 1단계 그림자 `member_badge_counters` 퇴역.
--
-- 이유: 이 표를 읽는 곳은 그림자 비교(get_member_badge_counters)뿐이었고, 2단계 입력 표
--       `member_unread_room_inputs`(20271119200000)가 화면 숫자의 쓰기 시점 원본으로 대체했다.
--       그런데 트리거 4개는 메시지 보내기·읽음 트랜잭션 안에서 참가자마다 안 읽음을 다시 세고 있었다.
-- 순서: 앱 코드(그림자 호출 제거)가 운영에 나간 뒤에 적용한다. 먼저 적용하면 그림자 RPC 가 오류(조용히 건너뜀)만 낸다.
-- 남기는 것: internal.cm_badge_text_has_content — member_unread_room_inputs 트리거가 같이 쓴다.
-- 되돌리기: 20271119150000_member_badge_counters_shadow.sql 재적용(백필 포함).

drop trigger if exists trg_member_badge_counters_participants_ins on public.community_messenger_participants;
drop trigger if exists trg_member_badge_counters_participants_upd on public.community_messenger_participants;
drop trigger if exists trg_member_badge_counters_participants_del on public.community_messenger_participants;
drop trigger if exists trg_member_badge_counters_participants on public.community_messenger_participants;
drop trigger if exists trg_member_badge_counters_rooms on public.community_messenger_rooms;

drop function if exists internal.trg_member_badge_counters_participants();
drop function if exists internal.trg_member_badge_counters_rooms();
drop function if exists public.get_member_badge_counters(uuid);
drop function if exists internal.recompute_member_badge_counters(uuid);

drop table if exists public.member_badge_counters;
