-- 커뮤니티 게시글 내부 공유 — message_type / last_message_type 에 community_post_share 추가

alter table public.community_messenger_messages
  drop constraint if exists community_messenger_messages_message_type_check;

alter table public.community_messenger_messages
  add constraint community_messenger_messages_message_type_check
  check (message_type in ('text', 'image', 'file', 'system', 'call_stub', 'voice', 'sticker', 'community_post_share'));

alter table public.community_messenger_rooms
  drop constraint if exists community_messenger_rooms_last_message_type_check;

alter table public.community_messenger_rooms
  add constraint community_messenger_rooms_last_message_type_check
  check (last_message_type in ('text', 'image', 'file', 'system', 'call_stub', 'voice', 'sticker', 'community_post_share'));
