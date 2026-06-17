-- Backfill Telegram-style friendship SSOT from legacy social graph + accepted direct rooms.
-- Does not delete community_messenger_message_requests (deprecated, ignored by app core).

create index if not exists community_messenger_friendships_readd_blocked_until_idx
  on public.community_messenger_friendships (readd_blocked_until)
  where readd_blocked_until is not null;

create index if not exists community_messenger_friendships_updated_at_idx
  on public.community_messenger_friendships (updated_at desc);

-- Mutual friend saved contacts -> accepted friendship
insert into public.community_messenger_friendships (
  requester_user_id,
  addressee_user_id,
  status,
  accepted_at,
  created_at,
  updated_at
)
select
  least(a.owner_user_id, a.target_user_id) as requester_user_id,
  greatest(a.owner_user_id, a.target_user_id) as addressee_user_id,
  'accepted',
  greatest(a.created_at, b.created_at),
  least(a.created_at, b.created_at),
  now()
from public.user_social_relations a
join public.user_social_relations b
  on a.owner_user_id = b.target_user_id
 and a.target_user_id = b.owner_user_id
 and a.relation_type = 'friend'
 and b.relation_type = 'friend'
where a.owner_user_id < a.target_user_id
  and not exists (
    select 1
    from public.community_messenger_friendships f
    where least(f.requester_user_id, f.addressee_user_id) = least(a.owner_user_id, a.target_user_id)
      and greatest(f.requester_user_id, f.addressee_user_id) = greatest(a.owner_user_id, a.target_user_id)
  );

-- Accepted general direct rooms (legacy rows without friendship) -> accepted friendship
insert into public.community_messenger_friendships (
  requester_user_id,
  addressee_user_id,
  status,
  accepted_at,
  created_at,
  updated_at
)
select distinct
  least(p1.user_id, p2.user_id),
  greatest(p1.user_id, p2.user_id),
  'accepted',
  coalesce(r.accepted_at, r.last_message_at, now()),
  coalesce(r.accepted_at, r.last_message_at, now()),
  now()
from public.community_messenger_rooms r
join public.community_messenger_participants p1 on p1.room_id = r.id
join public.community_messenger_participants p2 on p2.room_id = r.id and p2.user_id <> p1.user_id
where r.room_type = 'direct'
  and r.direct_key like '%:%'
  and r.direct_key not like 'trade_item:%'
  and r.direct_key not like 'trade_pc:%'
  and r.direct_key not like 'store_order:%'
  and r.direct_key not like 'trade_order:%'
  and coalesce(r.relation_status, 'accepted') = 'accepted'
  and not exists (
    select 1
    from public.community_messenger_friendships f
    where least(f.requester_user_id, f.addressee_user_id) = least(p1.user_id, p2.user_id)
      and greatest(f.requester_user_id, f.addressee_user_id) = greatest(p1.user_id, p2.user_id)
  );

-- Blocked social relations -> blocked friendship
insert into public.community_messenger_friendships (
  requester_user_id,
  addressee_user_id,
  status,
  blocked_by_user_id,
  blocked_at,
  readd_blocked_until,
  created_at,
  updated_at
)
select
  b.owner_user_id,
  b.target_user_id,
  'blocked',
  b.owner_user_id,
  b.created_at,
  b.created_at + interval '24 hours',
  b.created_at,
  now()
from public.user_social_relations b
where b.relation_type = 'blocked'
  and not exists (
    select 1
    from public.community_messenger_friendships f
    where least(f.requester_user_id, f.addressee_user_id) = least(b.owner_user_id, b.target_user_id)
      and greatest(f.requester_user_id, f.addressee_user_id) = greatest(b.owner_user_id, b.target_user_id)
  );

comment on table public.community_messenger_message_requests is
  'DEPRECATED — Discord-style message request archive. Telegram-style CM uses community_messenger_friendships.';
