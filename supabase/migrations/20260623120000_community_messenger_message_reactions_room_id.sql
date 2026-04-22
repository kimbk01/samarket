-- Realtime 라우팅: 반응 행에 room_id 를 두어 번들 채널에서 방별 디바운스 리프레시에 사용한다.

alter table public.community_messenger_message_reactions
  add column if not exists room_id uuid;

update public.community_messenger_message_reactions r
set room_id = m.room_id
from public.community_messenger_messages m
where m.id = r.message_id
  and (r.room_id is distinct from m.room_id);

create index if not exists community_messenger_message_reactions_room_idx
  on public.community_messenger_message_reactions (room_id)
  where room_id is not null;

create or replace function public.community_messenger_message_reactions_set_room_id()
returns trigger
language plpgsql
as $$
begin
  if new.room_id is null then
    select m.room_id into new.room_id
    from public.community_messenger_messages m
    where m.id = new.message_id;
  end if;
  return new;
end;
$$;

drop trigger if exists community_messenger_message_reactions_set_room_id_trg
  on public.community_messenger_message_reactions;
create trigger community_messenger_message_reactions_set_room_id_trg
  before insert or update of message_id, room_id
  on public.community_messenger_message_reactions
  for each row
  execute procedure public.community_messenger_message_reactions_set_room_id();
