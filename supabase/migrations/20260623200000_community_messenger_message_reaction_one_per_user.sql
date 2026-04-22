-- 메시지 반응: 사용자당 1개만 (같은 메시지에 다른 이모지 선택 시 교체, 동일 이모지 재탭 시 해제)

-- 동일 (message_id, user_id) 중복 행 제거 — 최신 created_at 1행만 유지
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

alter table public.community_messenger_message_reactions
  drop constraint if exists community_messenger_message_reactions_pkey;

alter table public.community_messenger_message_reactions
  add primary key (message_id, user_id);

comment on table public.community_messenger_message_reactions is
  '메시지별 반응 — (message_id, user_id) 당 1행만 허용, reaction_key 변경 시 upsert 성격은 앱에서 delete+insert.';
