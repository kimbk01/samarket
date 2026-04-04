-- 거래(item_trade)와 주문(order-chat 전용 테이블)만 남기고
-- 그 외 커뮤니티/일반/비즈/그룹/레거시 오픈채팅 축을 제거한다.

BEGIN;

DROP FUNCTION IF EXISTS public.ensure_default_meeting_open_chat_room_atomic(uuid, uuid, text, integer, text);

UPDATE public.meetings
SET chat_room_id = NULL
WHERE chat_room_id IN (
  SELECT id
  FROM public.chat_rooms
  WHERE room_type IN (
    'general_chat',
    'community',
    'group',
    'business',
    'group_meeting',
    'store_order'
  )
);

DELETE FROM public.chat_reports
WHERE room_id IN (
  SELECT id
  FROM public.chat_rooms
  WHERE room_type IN (
    'general_chat',
    'community',
    'group',
    'business',
    'group_meeting',
    'store_order'
  )
);

DELETE FROM public.chat_requests
WHERE room_id IN (
  SELECT id
  FROM public.chat_rooms
  WHERE room_type IN (
    'general_chat',
    'community',
    'group',
    'business',
    'group_meeting',
    'store_order'
  )
);

DELETE FROM public.chat_event_logs
WHERE room_id IN (
  SELECT id
  FROM public.chat_rooms
  WHERE room_type IN (
    'general_chat',
    'community',
    'group',
    'business',
    'group_meeting',
    'store_order'
  )
);

DELETE FROM public.chat_messages
WHERE room_id IN (
  SELECT id
  FROM public.chat_rooms
  WHERE room_type IN (
    'general_chat',
    'community',
    'group',
    'business',
    'group_meeting',
    'store_order'
  )
);

DELETE FROM public.chat_room_participants
WHERE room_id IN (
  SELECT id
  FROM public.chat_rooms
  WHERE room_type IN (
    'general_chat',
    'community',
    'group',
    'business',
    'group_meeting',
    'store_order'
  )
);

DELETE FROM public.chat_rooms
WHERE room_type IN (
  'general_chat',
  'community',
  'group',
  'business',
  'group_meeting',
  'store_order'
);

DROP TABLE IF EXISTS public.meeting_open_chat_logs CASCADE;
DROP TABLE IF EXISTS public.meeting_open_chat_notices CASCADE;
DROP TABLE IF EXISTS public.meeting_open_chat_bans CASCADE;
DROP TABLE IF EXISTS public.meeting_open_chat_reports CASCADE;
DROP TABLE IF EXISTS public.meeting_open_chat_join_requests CASCADE;
DROP TABLE IF EXISTS public.meeting_open_chat_attachments CASCADE;
DROP TABLE IF EXISTS public.meeting_open_chat_messages CASCADE;
DROP TABLE IF EXISTS public.meeting_open_chat_members CASCADE;
DROP TABLE IF EXISTS public.meeting_open_chat_rooms CASCADE;

DROP TABLE IF EXISTS public.community_chat_logs CASCADE;
DROP TABLE IF EXISTS public.community_chat_join_requests CASCADE;
DROP TABLE IF EXISTS public.community_chat_notices CASCADE;
DROP TABLE IF EXISTS public.community_chat_bans CASCADE;
DROP TABLE IF EXISTS public.community_chat_reports CASCADE;
DROP TABLE IF EXISTS public.community_chat_message_attachments CASCADE;
DROP TABLE IF EXISTS public.community_chat_messages CASCADE;
DROP TABLE IF EXISTS public.community_chat_room_members CASCADE;
DROP TABLE IF EXISTS public.community_chat_rooms CASCADE;

DROP TABLE IF EXISTS public.open_chat_notices CASCADE;
DROP TABLE IF EXISTS public.open_chat_bans CASCADE;
DROP TABLE IF EXISTS public.open_chat_join_requests CASCADE;
DROP TABLE IF EXISTS public.open_chat_members CASCADE;
DROP TABLE IF EXISTS public.open_chat_rooms CASCADE;

COMMIT;
