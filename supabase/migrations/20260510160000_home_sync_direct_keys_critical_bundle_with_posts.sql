-- HS3-FINAL: critical home-sync directKeys — ledger(trade_pc + item_trade) + posts(고정 컬럼) 단일 RPC.
-- 클라이언트에서 bundle RPC + posts fetch 2RTT 직렬을 1RTT로 줄인다.
-- posts 컬럼 목록은 서비스 TRADE_CHAT_LIST_POST_SELECT_CRITICAL 과 동일해야 한다.
-- 이 RPC는 public.posts 를 읽는다. 앱/다른 경로가 posts_masked 등 다른 소스를 쓸 때
-- 컬럼·행 가시성이 다르면 클라이언트 무결성 검사가 레거시 경로로 폴백할 수 있다.

create or replace function public.home_sync_direct_keys_critical_bundle(
  p_item_room_ids uuid[],
  p_trade_pc_ids uuid[]
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with
  pc_from_key as (
    select pc.id, pc.post_id, pc.seller_id, pc.buyer_id
    from public.product_chats pc
    where pc.id = any(coalesce(p_trade_pc_ids, '{}'::uuid[]))
  ),
  item_cr as (
    select cr.id, cr.item_id, cr.seller_id, cr.buyer_id
    from public.chat_rooms cr
    where cr.room_type = 'item_trade'
      and cr.id = any(coalesce(p_item_room_ids, '{}'::uuid[]))
  ),
  pc_dedup as (
    select distinct on (pc.post_id, pc.seller_id, pc.buyer_id)
      pc.id,
      pc.post_id,
      pc.seller_id,
      pc.buyer_id
    from public.product_chats pc
    where pc.post_id in (select distinct ic.item_id from item_cr ic)
    order by pc.post_id asc, pc.seller_id asc, pc.buyer_id asc, pc.id asc
  ),
  item_ledger as (
    select
      cr.id as room_id,
      cr.item_id,
      cr.seller_id,
      cr.buyer_id,
      p.id as pc_id,
      p.post_id as pc_post_id,
      p.seller_id as pc_seller_id,
      p.buyer_id as pc_buyer_id
    from item_cr cr
    left join pc_dedup p
      on p.post_id = cr.item_id
     and p.seller_id = cr.seller_id
     and p.buyer_id = cr.buyer_id
  ),
  all_post_ids as (
    select distinct z.pid as id
    from (
      select post_id as pid from pc_from_key
      union
      select item_id as pid from item_cr
    ) z
    where z.pid is not null
  ),
  post_rows as (
    select
      p.id,
      p.title,
      p.price,
      p.images,
      p.thumbnail_url,
      p.status,
      p.seller_listing_state,
      p.trade_category_id,
      p.trade_type,
      p.user_id
    from public.posts p
    where p.id in (select id from all_post_ids)
  )
  select jsonb_build_object(
    'itemLedger',
    coalesce(
      (select jsonb_agg(to_jsonb(il))
       from item_ledger il),
      '[]'::jsonb
    ),
    'tradePcFromKey',
    coalesce(
      (select jsonb_agg(to_jsonb(pcf))
       from pc_from_key pcf),
      '[]'::jsonb
    ),
    'posts',
    coalesce(
      (select jsonb_agg(to_jsonb(pr))
       from post_rows pr),
      '[]'::jsonb
    )
  );
$$;

comment on function public.home_sync_direct_keys_critical_bundle(uuid[], uuid[]) is
  'HS3-FINAL critical directKeys: item_trade ledger + trade_pc 시드 + posts 한 번의 DB 라운드.';

grant execute on function public.home_sync_direct_keys_critical_bundle(uuid[], uuid[]) to authenticated;
grant execute on function public.home_sync_direct_keys_critical_bundle(uuid[], uuid[]) to service_role;
