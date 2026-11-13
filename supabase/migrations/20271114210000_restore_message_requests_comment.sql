-- 20271114200000 에서 지시 목록 밖 용어(Discord-style)까지 지운 주석을 원래대로 복구 (Owner 지시 2026-11-13).
-- 지시 목록 용어만 뺀 상태로 둔다.
comment on table public.community_messenger_message_requests is
  'DEPRECATED — Discord-style message request archive. CM uses community_messenger_friendships.';
