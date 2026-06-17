-- DIBAY friendship SSOT backfill 검증 (Supabase SQL Editor에서 실행)
-- 적용 전: 20260918170000 + 20260918180000 migration 선행

select 'table_exists' as check_name,
  exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'community_messenger_friendships'
  ) as value;

select 'unique_pair_index_exists' as check_name,
  exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'community_messenger_friendships_pair_idx'
  ) as value;

select 'accepted_friendship_count' as check_name, count(*)::int as value
from public.community_messenger_friendships where status = 'accepted';

select 'blocked_friendship_count' as check_name, count(*)::int as value
from public.community_messenger_friendships where status = 'blocked';

select 'duplicate_pair_rows' as check_name, count(*)::int as value
from (
  select least(requester_user_id, addressee_user_id) u1,
         greatest(requester_user_id, addressee_user_id) u2,
         count(*) c
  from public.community_messenger_friendships
  group by 1, 2
  having count(*) > 1
) d;

select 'status_null_rows' as check_name, count(*)::int as value
from public.community_messenger_friendships where status is null;

select 'self_pair_rows' as check_name, count(*)::int as value
from public.community_messenger_friendships where requester_user_id = addressee_user_id;

select 'accepted_direct_rooms_without_friendship' as check_name, count(*)::int as value
from (
  select distinct least(p1.user_id, p2.user_id) u1, greatest(p1.user_id, p2.user_id) u2
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
) pairs
where not exists (
  select 1 from public.community_messenger_friendships f
  where least(f.requester_user_id, f.addressee_user_id) = pairs.u1
    and greatest(f.requester_user_id, f.addressee_user_id) = pairs.u2
    and f.status = 'accepted'
);

select 'blocked_rows_missing_blocker' as check_name, count(*)::int as value
from public.community_messenger_friendships
where status = 'blocked' and blocked_by_user_id is null;

select 'mutual_friend_social_without_accepted_friendship' as check_name, count(*)::int as value
from public.user_social_relations a
join public.user_social_relations b
  on a.owner_user_id = b.target_user_id
 and a.target_user_id = b.owner_user_id
 and a.relation_type = 'friend'
 and b.relation_type = 'friend'
where not exists (
  select 1 from public.community_messenger_friendships f
  where least(f.requester_user_id, f.addressee_user_id) = least(a.owner_user_id, a.target_user_id)
    and greatest(f.requester_user_id, f.addressee_user_id) = greatest(a.owner_user_id, a.target_user_id)
    and f.status = 'accepted'
);
