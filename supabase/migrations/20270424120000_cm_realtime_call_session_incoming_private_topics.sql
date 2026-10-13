-- B (Owner-approved): restore Realtime contract for call topics under Public access OFF.
-- Production joins community-messenger-incoming-call:<uid>, community-messenger-call-session:<sid>
-- and community-messenger-call-signal-hangup:<sid> must be private; these topics were missing from
-- internal.cm_realtime_can_read_topic, so joins were rejected and clients fell back to HTTP polling.
--
-- Body below = 20270422140000_cm_realtime_notifications_rt_private_topic.sql (identical to the live
-- Production function, 40 topic clauses) + the three call clauses only. No other topic changes.
-- Read-only (SELECT) authorization; cm_realtime_can_send_topic is unchanged.

create or replace function internal.cm_realtime_can_access_call_session(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select p_session_id is not null
    and auth.uid() is not null
    and exists (
      select 1
      from public.community_messenger_call_sessions s
      where s.id = p_session_id
        and (
          s.initiator_user_id = auth.uid()
          or s.recipient_user_id = auth.uid()
          or exists (
            select 1
            from public.community_messenger_call_session_participants p
            where p.session_id = s.id
              and p.user_id = auth.uid()
          )
        )
    );
$$;

revoke all on function internal.cm_realtime_can_access_call_session(uuid) from public, anon;

comment on function internal.cm_realtime_can_access_call_session(uuid) is
  'Realtime Authorization helper: caller, callee or listed participant of the call session.';

create or replace function internal.cm_realtime_can_read_topic(p_topic text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(
    case
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
      when p_topic like 'notifications-rt:%' then
        internal.cm_realtime_topic_suffix_uuid(p_topic, 'notifications-rt:') = auth.uid()
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
      -- 1:1 incoming call row changes for the signed-in callee only
      when p_topic like 'community-messenger-incoming-call:%' then
        internal.cm_realtime_topic_suffix_uuid(p_topic, 'community-messenger-incoming-call:') = auth.uid()
      -- call session row / hangup signal changes for parties of that call only
      when p_topic like 'community-messenger-call-session:%' then
        internal.cm_realtime_can_access_call_session(
          internal.cm_realtime_topic_suffix_uuid(p_topic, 'community-messenger-call-session:')
        )
      when p_topic like 'community-messenger-call-signal-hangup:%' then
        internal.cm_realtime_can_access_call_session(
          internal.cm_realtime_topic_suffix_uuid(p_topic, 'community-messenger-call-signal-hangup:')
        )
      else false
    end,
    false
  );
$$;

comment on function internal.cm_realtime_can_read_topic(text) is
  'Realtime Authorization SELECT: private broadcast/postgres_changes/presence topics incl. incoming-call / call-session / call hangup.';
