-- 메시지 반응 데이터 정리: (1) 작성자 본인이 자기 메시지에 단 행 (2) 앱에서 허용하지 않는 reaction_key
-- 구 스키마 PK (message_id, user_id, reaction_key) 시 동일 유저가 서로 다른 이모지로 복수 행을 가질 수 있었음 —
-- 앱 집계는 (message_id, user_id)당 최신 1행만 쓰지만, DB를 깨끗이 하면 1:1 방에서 이중 표시 원인을 제거한다.

delete from public.community_messenger_message_reactions r
using public.community_messenger_messages m
where r.message_id = m.id
  and r.user_id = m.sender_id;

delete from public.community_messenger_message_reactions
where reaction_key is not null
  and trim(reaction_key) <> ''
  and reaction_key not in ('😀', '😮', '❤️', '👍', '👏', '😢');

-- (message_id, user_id) 중복이 남아 있으면 최신 created_at 1행만 유지
with ranked as (
  select
    ctid,
    row_number() over (
      partition by message_id, user_id
      order by created_at desc nulls last, ctid desc
    ) as rn
  from public.community_messenger_message_reactions
)
delete from public.community_messenger_message_reactions r
using ranked x
where r.ctid = x.ctid
  and x.rn > 1;
