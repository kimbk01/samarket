-- 거래 채팅(item_trade chat_rooms) → product_chats 보정을 DB 함수 1회로 — 요청 증폭 근본 수정 3단계 C-1.
-- 이전 (lib/trade/touch-product-chat-from-item-trade-room.ts): 목록 API 마다 방 N개를 돌며 방마다 product_chats 조회 1회 +
-- (마지막 메시지가 있으면) 값이 같아도 UPDATE 1회 → 운영 456개 방 차이 0건인데 매번 다시 저장 (updated_at 도 매번 now()).
-- 이후: 한 문장에서 없는 행만 INSERT, 마지막 메시지 시각·미리보기(200자)가 다른 행만 UPDATE. 결과 상태는 이전과 같다.
-- 대상 방 = (p_role='seller' 이면 seller_id = p_user_id, 'buyer' 이면 buyer_id = p_user_id) 또는 item_id ∈ p_post_ids.

create or replace function public.reconcile_product_chats_from_item_trade(
  p_user_id uuid,
  p_role text,
  p_post_ids uuid[]
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  v_inserted int := 0;
  v_updated int := 0;
begin
  if p_role is not null and p_role not in ('seller', 'buyer') then
    raise exception 'invalid_role';
  end if;

  with src as (
    select distinct on (cr.item_id, cr.seller_id, cr.buyer_id)
           cr.item_id, cr.seller_id, cr.buyer_id
      from public.chat_rooms cr
     where cr.room_type = 'item_trade'
       and cr.item_id is not null and cr.seller_id is not null and cr.buyer_id is not null
       and (
         (p_user_id is not null and p_role = 'seller' and cr.seller_id = p_user_id)
         or (p_user_id is not null and p_role = 'buyer' and cr.buyer_id = p_user_id)
         or (p_post_ids is not null and cr.item_id = any(p_post_ids))
       )
  ), ins as (
    insert into public.product_chats (post_id, seller_id, buyer_id)
    select s.item_id, s.seller_id, s.buyer_id
      from src s
     where not exists (
       select 1 from public.product_chats pc
        where pc.post_id = s.item_id and pc.seller_id = s.seller_id and pc.buyer_id = s.buyer_id
     )
    on conflict do nothing
    returning 1
  )
  select count(*) into v_inserted from ins;

  with src as (
    select distinct on (cr.item_id, cr.seller_id, cr.buyer_id)
           cr.item_id, cr.seller_id, cr.buyer_id, cr.last_message_at,
           left(coalesce(cr.last_message_preview, ''), 200) as preview
      from public.chat_rooms cr
     where cr.room_type = 'item_trade'
       and cr.item_id is not null and cr.seller_id is not null and cr.buyer_id is not null
       and cr.last_message_at is not null
       and (
         (p_user_id is not null and p_role = 'seller' and cr.seller_id = p_user_id)
         or (p_user_id is not null and p_role = 'buyer' and cr.buyer_id = p_user_id)
         or (p_post_ids is not null and cr.item_id = any(p_post_ids))
       )
     order by cr.item_id, cr.seller_id, cr.buyer_id, cr.last_message_at desc
  ), upd as (
    update public.product_chats pc
       set last_message_at = s.last_message_at,
           last_message_preview = s.preview,
           updated_at = s.last_message_at
      from src s
     where pc.post_id = s.item_id and pc.seller_id = s.seller_id and pc.buyer_id = s.buyer_id
       and (pc.last_message_at is distinct from s.last_message_at
            or pc.last_message_preview is distinct from s.preview)
    returning 1
  )
  select count(*) into v_updated from upd;

  return jsonb_build_object('inserted', v_inserted, 'updated', v_updated);
end;
$$;

revoke all on function public.reconcile_product_chats_from_item_trade(uuid, text, uuid[]) from public, anon, authenticated;
grant execute on function public.reconcile_product_chats_from_item_trade(uuid, text, uuid[]) to service_role;
