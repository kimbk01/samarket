-- Wave-1 MISSED NORMAL recovery MERGE:
-- Align authoritative incoming_ring_timeout_seconds with historical NORMAL 30s proposer.
-- Server missed gate / writer unchanged; runtime deadline value only.
-- Do not leave existing default row at 45 (gate would still reject Native 30s propose).

alter table public.admin_messenger_call_sound_settings
  alter column incoming_ring_timeout_seconds set default 30;

update public.admin_messenger_call_sound_settings
set incoming_ring_timeout_seconds = 30
where id = 'default'
  and incoming_ring_timeout_seconds = 45;
