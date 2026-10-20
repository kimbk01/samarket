-- R7 잔여 (delivery_a) — 주문 채팅 목록 서버 페이지네이션
-- 목적: /admin/order-chats 가 「주문에 연결된 방(FK)」 200건 + 「FK 없는 주문 200건 중 주문 키로 찾은 방」을
--       메모리에서 합쳐 200건으로 자르고, 검색·페이지를 브라우저에서 하던 경로를 없앤다.
--       두 출처를 DB 에서 한 번에 합쳐 검색·정렬·페이지·정확한 total 을 계산한다. 방 생성·FK 보정 없음 (조회 전용).
-- 방 해석 순서 = lib/admin-delivery-orders/store-order-room-lookup.ts (사용자 ensure 와 같은 순서, 생성 없음):
--   1) store_orders.community_messenger_room_id  → room_source 'linked'
--   2) community_messenger_rooms (chat_domain='store_order', domain_identity_key='store_order:{id}') → 'fallback'
--   3) community_messenger_rooms (room_type='direct', direct_key in ('store_order:{id}','trade_order:{id}'), 오래된 방 우선) → 'fallback'
-- 대상 화면: /admin/order-chats (API GET /api/admin/order-chats)
-- 권한: SECURITY DEFINER · search_path=public · EXECUTE 는 service_role 만 (PUBLIC·anon·authenticated 회수).
-- 정렬(결정적): 최근 메시지 시각(방 last_message_at → 주문 updated_at → created_at) desc, order_id desc.
-- 검색 p_q: 주문번호 · 주문 ID · 매장명 · 고객 닉네임/아이디 · 고객 회원 ID 부분 일치 (대소문자 무시, 와일드카드 문자는 글자 그대로).
-- unread·읽음 상태는 읽지도 쓰지도 않는다 (주문 채팅 unread 역할 분리 유지).
-- 롤백:
--   drop function if exists public.admin_store_order_chats_page(text, integer, integer);

create or replace function public.admin_store_order_chats_page(
  p_q text default null,
  p_limit integer default 20,
  p_offset integer default 0
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with params as (
    select
      case
        when nullif(btrim(coalesce(p_q, '')), '') is null then null
        else '%' || replace(replace(replace(btrim(p_q), '\', '\\'), '%', '\%'), '_', '\_') || '%'
      end as pat,
      least(100, greatest(1, coalesce(p_limit, 20))) as lim,
      least(100000, greatest(0, coalesce(p_offset, 0))) as off
  ),
  resolved as (
    select
      so.id as order_id,
      so.order_no,
      so.store_id,
      so.buyer_user_id,
      so.order_status,
      so.updated_at as order_updated_at,
      so.created_at as order_created_at,
      coalesce(so.community_messenger_room_id, fb.room_id) as room_id,
      case when so.community_messenger_room_id is not null then 'linked' else 'fallback' end as room_source
    from public.store_orders so
    left join lateral (
      select coalesce(
        (select r.id
           from public.community_messenger_rooms r
          where r.chat_domain = 'store_order'
            and r.domain_identity_key = 'store_order:' || so.id::text
          limit 1),
        (select r.id
           from public.community_messenger_rooms r
          where r.room_type = 'direct'
            and r.direct_key in ('store_order:' || so.id::text, 'trade_order:' || so.id::text)
          order by r.created_at asc, r.id asc
          limit 1)
      ) as room_id
      where so.community_messenger_room_id is null
    ) fb on true
  ),
  filtered as (
    select
      rs.*,
      rm.last_message,
      rm.last_message_at,
      st.store_name,
      pf.nickname,
      pf.username,
      coalesce(rm.last_message_at, rs.order_updated_at, rs.order_created_at) as sort_at
    from resolved rs
    left join public.community_messenger_rooms rm on rm.id = rs.room_id
    left join public.stores st on st.id = rs.store_id
    left join public.profiles pf on pf.id = rs.buyer_user_id
    cross join params pr
    where rs.room_id is not null
      and (pr.pat is null
           or rs.order_no ilike pr.pat
           or rs.order_id::text ilike pr.pat
           or st.store_name ilike pr.pat
           or pf.nickname ilike pr.pat
           or pf.username ilike pr.pat
           or rs.buyer_user_id::text ilike pr.pat)
  ),
  page as (
    select f.*
      from filtered f
     order by f.sort_at desc nulls last, f.order_id desc
     limit (select lim from params)
    offset (select off from params)
  )
  select jsonb_build_object(
    'total', (select count(*)::bigint from filtered),
    'limit', (select lim from params),
    'offset', (select off from params),
    'rows', coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'order_id', p.order_id,
                 'order_no', p.order_no,
                 'room_id', p.room_id,
                 'room_source', p.room_source,
                 'store_id', p.store_id,
                 'store_name', p.store_name,
                 'buyer_user_id', p.buyer_user_id,
                 'buyer_nickname', p.nickname,
                 'buyer_username', p.username,
                 'order_status', p.order_status,
                 'last_message', p.last_message,
                 'last_message_at', p.last_message_at,
                 'order_updated_at', p.order_updated_at,
                 'order_created_at', p.order_created_at
               )
               order by p.sort_at desc nulls last, p.order_id desc
             )
        from page p
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.admin_store_order_chats_page(text, integer, integer)
  from public, anon, authenticated;

grant execute on function public.admin_store_order_chats_page(text, integer, integer)
  to service_role;
