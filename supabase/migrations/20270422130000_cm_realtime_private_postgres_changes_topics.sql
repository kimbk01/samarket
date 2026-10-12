-- P0 residual: Private Realtime Authorization for Postgres Changes (and presence) topics
-- that still join as public channels. Table RLS on postgres_changes is unchanged.
-- Extends internal.cm_realtime_can_read_topic / can_send_topic from
-- 20270422120000_cm_realtime_private_broadcast_authorization.sql.
--
-- Topic access is scoped to the same subject who already receives events under public join
-- + table RLS (participant / seller-buyer / requester / rider / platform admin). No open allow-all policy.

create or replace function internal.cm_realtime_topic_first_uuid_after(p_topic text, p_prefix text)
returns uuid
language sql
immutable
as $$
  select case
    when p_topic is null or p_prefix is null or left(p_topic, length(p_prefix)) <> p_prefix then null
    when substr(p_topic, length(p_prefix) + 1)
      ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(:|$)'
      then (
        substring(
          substr(p_topic, length(p_prefix) + 1)
          from '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
        )
      )::uuid
    else null
  end;
$$;

revoke all on function internal.cm_realtime_topic_first_uuid_after(text, text) from public;
grant execute on function internal.cm_realtime_topic_first_uuid_after(text, text) to authenticated;

comment on function internal.cm_realtime_topic_first_uuid_after(text, text) is
  'Realtime Authorization: first uuid after prefix (optional :suffix ignored).';

create or replace function public.trade_can_access_integrated_chat_room(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(
    p_room_id is not null
    and auth.uid() is not null
    and (
      exists (
        select 1
        from public.chat_room_participants p
        where p.room_id = p_room_id
          and p.user_id = auth.uid()
      )
      or exists (
        select 1
        from public.chat_rooms cr
        where cr.id = p_room_id
          and auth.uid() in (cr.seller_id, cr.buyer_id)
      )
    ),
    false
  );
$$;

revoke all on function public.trade_can_access_integrated_chat_room(uuid) from public;
grant execute on function public.trade_can_access_integrated_chat_room(uuid) to authenticated, service_role;

comment on function public.trade_can_access_integrated_chat_room(uuid) is
  'Realtime Authorization: chat_rooms participant or seller/buyer for kasama-chat:chat_messages topics.';

create or replace function public.group_can_access_group_chat_room(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(
    p_room_id is not null
    and auth.uid() is not null
    and exists (
      select 1
      from public.group_room_members m
      where m.room_id = p_room_id
        and m.user_id = auth.uid()
        and m.left_at is null
    ),
    false
  );
$$;

revoke all on function public.group_can_access_group_chat_room(uuid) from public;
grant execute on function public.group_can_access_group_chat_room(uuid) to authenticated, service_role;

comment on function public.group_can_access_group_chat_room(uuid) is
  'Realtime Authorization: active group_room_members for kasama-chat:group_messages topics.';

create or replace function public.support_can_access_support_case(p_case_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(
    p_case_id is not null
    and auth.uid() is not null
    and (
      public.is_platform_admin(auth.uid())
      or exists (
        select 1
        from public.support_cases c
        where c.id = p_case_id
          and c.requester_user_id = auth.uid()
      )
    ),
    false
  );
$$;

revoke all on function public.support_can_access_support_case(uuid) from public;
grant execute on function public.support_can_access_support_case(uuid) to authenticated, service_role;

comment on function public.support_can_access_support_case(uuid) is
  'Realtime Authorization: support case requester or platform admin.';

create or replace function public.store_can_access_store_realtime(p_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(
    p_store_id is not null
    and auth.uid() is not null
    and exists (
      select 1
      from public.stores s
      where s.id = p_store_id
        and s.owner_user_id = auth.uid()
    ),
    false
  );
$$;

revoke all on function public.store_can_access_store_realtime(uuid) from public;
grant execute on function public.store_can_access_store_realtime(uuid) to authenticated, service_role;

create or replace function public.store_can_access_order_delivery_realtime(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(
    p_order_id is not null
    and auth.uid() is not null
    and exists (
      select 1
      from public.store_orders o
      join public.stores s on s.id = o.store_id
      where o.id = p_order_id
        and (o.buyer_user_id = auth.uid() or s.owner_user_id = auth.uid())
    ),
    false
  );
$$;

revoke all on function public.store_can_access_order_delivery_realtime(uuid) from public;
grant execute on function public.store_can_access_order_delivery_realtime(uuid) to authenticated, service_role;

create or replace function internal.cm_realtime_can_read_topic(p_topic text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(
    case
      -- existing private broadcast topics (unchanged semantics)
      when p_topic like 'community-messenger-room-bump:%' then
        public.cm_can_access_messenger_room(internal.cm_realtime_topic_suffix_uuid(p_topic, 'community-messenger-room-bump:'))
      when p_topic like 'cm-read-ack:%' then
        public.cm_can_access_messenger_room(internal.cm_realtime_topic_suffix_uuid(p_topic, 'cm-read-ack:'))
      when p_topic like 'community-messenger-typing:%' then
        public.cm_can_access_messenger_room(internal.cm_realtime_topic_suffix_uuid(p_topic, 'community-messenger-typing:'))
      when p_topic like 'cm-home-list:%' then
        internal.cm_realtime_topic_suffix_uuid(p_topic, 'cm-home-list:') = auth.uid()
      when p_topic like 'cm-call-invite:%' then
        internal.cm_realtime_topic_suffix_uuid(p_topic, 'cm-call-invite:') = auth.uid()
      when p_topic like 'trade-chat-typing:%' then
        public.trade_can_access_trade_chat_room(internal.cm_realtime_topic_suffix_uuid(p_topic, 'trade-chat-typing:'))
      when p_topic like 'trade-chat-presence:%' then
        public.trade_can_access_trade_chat_room(internal.cm_realtime_topic_suffix_uuid(p_topic, 'trade-chat-presence:'))
      when p_topic like 'samarket:trade-post-listing:%' then
        public.trade_can_access_post_listing_broadcast(
          internal.cm_realtime_topic_suffix_uuid(p_topic, 'samarket:trade-post-listing:')
        )

      -- residual postgres_changes / presence topics (Public OFF compat)
      when p_topic like 'kasama-chat:chat_messages:%' then
        public.trade_can_access_integrated_chat_room(
          internal.cm_realtime_topic_suffix_uuid(p_topic, 'kasama-chat:chat_messages:')
        )
      when p_topic like 'kasama-chat:product_chat_messages:%' then
        public.trade_can_access_trade_chat_room(
          internal.cm_realtime_topic_suffix_uuid(p_topic, 'kasama-chat:product_chat_messages:')
        )
      when p_topic like 'kasama-chat:group_messages:%' then
        public.group_can_access_group_chat_room(
          internal.cm_realtime_topic_suffix_uuid(p_topic, 'kasama-chat:group_messages:')
        )
      when p_topic like 'integrated-chat-list:participants:%' then
        internal.cm_realtime_topic_suffix_uuid(p_topic, 'integrated-chat-list:participants:') = auth.uid()
      when p_topic like 'integrated-chat-list:msgs:%' then
        internal.cm_realtime_topic_first_uuid_after(p_topic, 'integrated-chat-list:msgs:') = auth.uid()
      when p_topic like 'integrated-chat-list:rooms:%' then
        internal.cm_realtime_topic_first_uuid_after(p_topic, 'integrated-chat-list:rooms:') = auth.uid()
      when p_topic like 'cm-room-friendship:%' then
        internal.cm_realtime_topic_first_uuid_after(p_topic, 'cm-room-friendship:') = auth.uid()
      when p_topic like 'support-modal-case-%' then
        public.support_can_access_support_case(
          internal.cm_realtime_topic_suffix_uuid(p_topic, 'support-modal-case-')
        )
      when p_topic like 'rider_orders_%' then
        internal.cm_realtime_topic_suffix_uuid(p_topic, 'rider_orders_') = auth.uid()
      when p_topic in (
        'admin-support-queue',
        'admin-stores-list-freshness',
        'admin-ops-realtime-bridge',
        'admin-community-messenger-overview'
      ) then
        public.is_platform_admin(auth.uid())
      when p_topic like 'admin-community-messenger-room:%' then
        public.is_platform_admin(auth.uid())
      when p_topic like 'community-messenger-home:meta:%' then
        internal.cm_realtime_topic_suffix_uuid(p_topic, 'community-messenger-home:meta:') = auth.uid()
      when p_topic like 'community-messenger-home:rooms-in:%' then
        internal.cm_realtime_topic_first_uuid_after(p_topic, 'community-messenger-home:rooms-in:') = auth.uid()
      when p_topic like 'global-messenger:bundle:%' then
        internal.cm_realtime_topic_first_uuid_after(p_topic, 'global-messenger:bundle:') = auth.uid()
      when p_topic like 'community-messenger-unread-sound:%' then
        internal.cm_realtime_topic_suffix_uuid(p_topic, 'community-messenger-unread-sound:') = auth.uid()
      when p_topic like 'community-messenger:call-logs:%' then
        internal.cm_realtime_topic_suffix_uuid(p_topic, 'community-messenger:call-logs:') = auth.uid()
      when p_topic like 'cm-home:posts-trade-meta:%' then
        internal.cm_realtime_topic_first_uuid_after(p_topic, 'cm-home:posts-trade-meta:') = auth.uid()
      when p_topic = 'community-messenger:presence' then
        auth.uid() is not null
      when p_topic like 'community-messenger-group-call-session:%' then
        exists (
          select 1
          from public.community_messenger_call_sessions s
          where s.id = internal.cm_realtime_topic_suffix_uuid(p_topic, 'community-messenger-group-call-session:')
            and (
              s.initiator_user_id = auth.uid()
              or s.recipient_user_id = auth.uid()
              or (
                s.room_id is not null
                and public.cm_can_access_messenger_room(s.room_id)
              )
            )
        )
      when p_topic like 'store-orders-rt:%' then
        public.store_can_access_store_realtime(internal.cm_realtime_topic_suffix_uuid(p_topic, 'store-orders-rt:'))
      when p_topic like 'owner-store-orders-rt:%' then
        public.store_can_access_store_realtime(internal.cm_realtime_topic_suffix_uuid(p_topic, 'owner-store-orders-rt:'))
      when p_topic like 'store-order-deliveries-rt:store:%' then
        public.store_can_access_store_realtime(
          internal.cm_realtime_topic_suffix_uuid(p_topic, 'store-order-deliveries-rt:store:')
        )
      when p_topic like 'store-order-deliveries-rt:order:%' then
        public.store_can_access_order_delivery_realtime(
          internal.cm_realtime_topic_suffix_uuid(p_topic, 'store-order-deliveries-rt:order:')
        )
      when p_topic like 'buyer-store-orders-rt:%' then
        internal.cm_realtime_topic_suffix_uuid(p_topic, 'buyer-store-orders-rt:') = auth.uid()
      when p_topic like 'buyer-store-order-deliveries-rt:%' then
        internal.cm_realtime_topic_suffix_uuid(p_topic, 'buyer-store-order-deliveries-rt:') = auth.uid()
      when p_topic like 'price-offers-product:%' then
        public.trade_can_access_post_listing_broadcast(
          internal.cm_realtime_topic_suffix_uuid(p_topic, 'price-offers-product:')
        )
      when p_topic like 'post-seller-listing:%' then
        public.trade_can_access_post_listing_broadcast(
          internal.cm_realtime_topic_suffix_uuid(p_topic, 'post-seller-listing:')
        )
      when p_topic like 'chat-list:posts-listing:%' then
        internal.cm_realtime_topic_first_uuid_after(p_topic, 'chat-list:posts-listing:') = auth.uid()
      else false
    end,
    false
  );
$$;

create or replace function internal.cm_realtime_can_send_topic(p_topic text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(
    case
      when p_topic like 'community-messenger-typing:%' then
        public.cm_can_access_messenger_room(internal.cm_realtime_topic_suffix_uuid(p_topic, 'community-messenger-typing:'))
      when p_topic like 'trade-chat-typing:%' then
        public.trade_can_access_trade_chat_room(internal.cm_realtime_topic_suffix_uuid(p_topic, 'trade-chat-typing:'))
      when p_topic like 'trade-chat-presence:%' then
        public.trade_can_access_trade_chat_room(internal.cm_realtime_topic_suffix_uuid(p_topic, 'trade-chat-presence:'))
      when p_topic like 'cm-call-invite:%' then
        exists (
          select 1
          from public.community_messenger_call_sessions s
          where s.session_mode is distinct from 'group'
            and s.started_at > now() - interval '6 hours'
            and (
              (s.initiator_user_id = auth.uid()
                and s.recipient_user_id = internal.cm_realtime_topic_suffix_uuid(p_topic, 'cm-call-invite:'))
              or (s.recipient_user_id = auth.uid()
                and s.initiator_user_id = internal.cm_realtime_topic_suffix_uuid(p_topic, 'cm-call-invite:'))
            )
        )
      -- presence track on private channel requires INSERT
      when p_topic = 'community-messenger:presence' then
        auth.uid() is not null
      else false
    end,
    false
  );
$$;
