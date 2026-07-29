-- Backfill call_logs peer contamination: peer_user_id == caller_user_id.
-- Safe 1:1 restore from session initiator/recipient when caller matches initiator.
-- Uncertain rows (caller != initiator, or missing session/recipient) are left untouched.

update public.community_messenger_call_logs cl
set peer_user_id = s.recipient_user_id
from public.community_messenger_call_sessions s
where cl.session_id = s.id
  and cl.peer_user_id is not null
  and cl.caller_user_id is not null
  and cl.peer_user_id = cl.caller_user_id
  and s.initiator_user_id = cl.caller_user_id
  and s.recipient_user_id is not null
  and s.recipient_user_id <> cl.caller_user_id;
