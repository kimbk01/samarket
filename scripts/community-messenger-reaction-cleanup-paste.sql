-- 붙여넣기용: Supabase SQL Editor 등에서 실행 가능 (내용은 마이그레이션 20260623210000 과 동일)
-- 메시지 반응 데이터 정리: (1) 작성자 본인이 자기 메시지에 단 행 (2) 앱에서 허용하지 않는 reaction_key
-- 구 스키마 PK (message_id, user_id, reaction_key) 시 동일 유저가 서로 다른 이모지로 복수 행을 가질 수 있었음

delete from public.community_messenger_message_reactions r
using public.community_messenger_messages m
where r.message_id = m.id
  and r.user_id = m.sender_id;

delete from public.community_messenger_message_reactions
where reaction_key is not null
  and trim(reaction_key) <> ''
  and reaction_key not in ('😀', '😮', '❤️', '👍', '👏', '😢');

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
