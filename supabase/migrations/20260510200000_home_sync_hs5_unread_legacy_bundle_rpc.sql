-- HS5-RETRY: 레거시 거래 unread 보강용 chat_rooms + product_chats 조회를
-- 단일 SQL·단일 PostgREST 호출로 묶어 이중 HTTP 왕복 꼬리 지연을 줄인다.
-- RLS: SECURITY INVOKER (REST .in() 과 동일하게 호출자 세션 정책 적용)

create or replace function public.home_sync_hs5_unread_legacy_bundle(
  p_cm_room_ids uuid[],
  p_pc_ids uuid[]
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'chatRows',
    coalesce(
      (
        select jsonb_agg(to_jsonb(t))
        from (
          select id, community_messenger_room_id
          from public.chat_rooms
          where room_type = 'item_trade'
            and community_messenger_room_id = any (coalesce(p_cm_room_ids, '{}'::uuid[]))
        ) t
      ),
      '[]'::jsonb
    ),
    'pcRows',
    coalesce(
      (
        select jsonb_agg(to_jsonb(u))
        from (
          select
            id,
            seller_id,
            buyer_id,
            unread_count_seller,
            unread_count_buyer
          from public.product_chats
          where id = any (coalesce(p_pc_ids, '{}'::uuid[]))
        ) u
      ),
      '[]'::jsonb
    )
  );
$$;

comment on function public.home_sync_hs5_unread_legacy_bundle(uuid[], uuid[]) is
  'HS5-RETRY: item_trade 링크(chat_rooms) + product_chats 미읽음 컬럼을 단일 DB 라운드로 반환.';

grant execute on function public.home_sync_hs5_unread_legacy_bundle(uuid[], uuid[]) to authenticated;
grant execute on function public.home_sync_hs5_unread_legacy_bundle(uuid[], uuid[]) to service_role;
