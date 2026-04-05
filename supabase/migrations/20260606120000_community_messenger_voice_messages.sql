-- 음성 메시지(채팅) — message_type / last_message_type 에 voice 추가

alter table public.community_messenger_messages
  drop constraint if exists community_messenger_messages_message_type_check;

alter table public.community_messenger_messages
  add constraint community_messenger_messages_message_type_check
  check (message_type in ('text', 'image', 'system', 'call_stub', 'voice'));

alter table public.community_messenger_rooms
  drop constraint if exists community_messenger_rooms_last_message_type_check;

alter table public.community_messenger_rooms
  add constraint community_messenger_rooms_last_message_type_check
  check (last_message_type in ('text', 'image', 'system', 'call_stub', 'voice'));
