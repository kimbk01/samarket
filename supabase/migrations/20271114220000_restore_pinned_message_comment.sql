-- 20271114200000 에서 지시 목록 밖 용어(Kakao)까지 지운 주석을 복구 (Owner 지시 2026-11-13).
-- 지시 목록 용어만 뺀 상태로 둔다.
comment on column public.community_messenger_rooms.pinned_message_id is
  'P1: single pinned group message (Kakao pin).';
