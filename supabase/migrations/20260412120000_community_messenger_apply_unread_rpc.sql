-- 메시지 전송 시 참가자별 UPDATE N회 대신 한 번의 UPDATE (핫 패스 지연·부하 감소)
create or replace function public.community_messenger_apply_unread_for_text_message(
  p_room_id uuid,
  p_sender_id uuid,
  p_read_at timestamptz
)
returns void
language sql
security definer
set search_path = public
as $$
  update public.community_messenger_participants p
  set
    unread_count = case
      when p.user_id = p_sender_id then 0
      else coalesce(p.unread_count, 0) + 1
    end,
    last_read_at = case
      when p.user_id = p_sender_id then p_read_at
      else null
    end
  where p.room_id = p_room_id;
$$;

comment on function public.community_messenger_apply_unread_for_text_message(uuid, uuid, timestamptz) is
  'sendCommunityMessengerMessage: 발신자 unread 0·last_read, 수신자 unread+1 (기존 JS와 동일 의미)';

grant execute on function public.community_messenger_apply_unread_for_text_message(uuid, uuid, timestamptz) to service_role;
