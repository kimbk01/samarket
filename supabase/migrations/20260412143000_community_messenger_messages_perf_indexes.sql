-- `community_messenger_messages_room_idx (room_id, created_at)` 가 방 단위 타임라인을 이미 커버.
-- 발신자 기준 조회·집계 보조
create index if not exists community_messenger_messages_sender_created_idx
  on public.community_messenger_messages (sender_id, created_at desc)
  where sender_id is not null;
