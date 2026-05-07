-- Aggregate unread counts server-side to avoid O(n) payload for owner hub badge.
-- Used by: `countOwnerOrderChatUnread` → `rpc('sum_owner_order_chat_unread', { owner_user_id })`
--
-- Notes:
-- - SECURITY DEFINER: called from server/service role; keep function simple.
-- - VOLATILE: depends on table contents.

create or replace function public.sum_owner_order_chat_unread(owner_user_id text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Some environments may not have `order_chat_rooms` yet.
  -- Keep the function deploy-safe and return 0 in that case.
  return (
    select coalesce(sum(ocr.unread_count_owner), 0)::bigint
    from public.order_chat_rooms ocr
    where ocr.owner_user_id = owner_user_id
      and ocr.room_status in ('active', 'admin_review')
  );
exception
  when undefined_table then
    return 0;
end;
$$;

