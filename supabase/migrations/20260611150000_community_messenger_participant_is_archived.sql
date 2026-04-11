-- 참가자별 채팅방 보관(메인 목록에서 숨김). 방 room_status 와 분리한다.
alter table public.community_messenger_participants
  add column if not exists is_archived boolean not null default false;

comment on column public.community_messenger_participants.is_archived is
  'Viewer-only: hide room from personal inbox (보관함). Independent of community_messenger_rooms.room_status.';

-- 과거에 방 전체를 archived 로 둔 경우 → 각 참가자 보관 플래그로 이전 후 방은 active 로 복구
update public.community_messenger_participants p
set is_archived = true
from public.community_messenger_rooms r
where r.id = p.room_id
  and r.room_status = 'archived';

update public.community_messenger_rooms
set room_status = 'active'
where room_status = 'archived';

create index if not exists community_messenger_participants_user_archived_idx
  on public.community_messenger_participants (user_id, is_archived)
  where is_archived = true;
