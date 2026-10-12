-- Community messenger + trade Realtime Authorization for PRIVATE broadcast topics (S-1 / S-2).
--
-- Runtime evidence (2026-10-12, production): an unauthenticated socket using only the anon key
-- joined public topics `community-messenger-room-bump:<roomId>`, `cm_read_ack`,
-- `community-messenger-typing:<roomId>` and received message bodies, read cursors and typing.
--
-- After this migration clients subscribe with `config.private = true` and the server
-- publishes with the service role via REST broadcast (`private: true`). Realtime evaluates
-- these policies on join (SELECT) and on client send (INSERT). service_role bypasses RLS.
--
-- Topics (realtime.topic() — without the `realtime:` prefix):
--   community-messenger-room-bump:<room uuid>  SELECT: room accessor            INSERT: none (server only)
--   cm-read-ack:<room uuid>                    SELECT: room accessor            INSERT: none (server only)
--   community-messenger-typing:<room uuid>     SELECT/INSERT: room accessor
--   cm-home-list:<user uuid>                   SELECT: that user                INSERT: none (server only)
--   cm-call-invite:<user uuid>                 SELECT: that user                INSERT: live 1:1 call peer
--   trade-chat-typing:<room uuid>              SELECT/INSERT: trade chat party (product_chats / chat_rooms)
--   trade-chat-presence:<room uuid>            SELECT/INSERT: trade chat party (same)
--   samarket:trade-post-listing:<post uuid>    SELECT: post seller or trade-chat party for post
--                                               INSERT: none (server only)
--
-- Room access uses EXISTING helper public.cm_can_access_messenger_room
-- (20261207120000_cm_group_active_membership_authority.sql — NOT internal.*).
-- Trade helpers: public.trade_can_access_trade_chat_room / public.trade_can_access_post_listing_broadcast.
--
-- P0 close requires BOTH:
--   (A) this migration + private subscribe/publish on messenger AND trade topics above
--   (B) Supabase Dashboard → Realtime → Settings → "Allow public access to channels" = DISABLED
-- Without (B), anon can still join PUBLIC channel names (no RLS check). Private-only publish reduces
-- payload leak but does NOT block anonymous join. Do not claim P0 closed with (A) alone.
--
-- Failure recovery (security-preserving): keep public access DISABLED; repair policies / redeploy
-- private clients. Re-enabling public access re-opens S-1/S-2 — not a safe security recovery.
--
-- Apply (Owner-approved staging first): migration → deploy private web+APK together
-- → verify participant private join + anon denied → then disable public access.

create schema if not exists internal;

create or replace function internal.cm_realtime_topic_suffix_uuid(p_topic text, p_prefix text)
returns uuid
language sql
immutable
as $$
  select case
    when p_topic is null or p_prefix is null or left(p_topic, length(p_prefix)) <> p_prefix then null
    when substr(p_topic, length(p_prefix) + 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then substr(p_topic, length(p_prefix) + 1)::uuid
    else null
  end;
$$;

comment on function internal.cm_realtime_topic_suffix_uuid(text, text) is
  'Realtime Authorization helper: uuid suffix of a topic, null when prefix/uuid does not match.';

-- Trade chat room id = product_chats.id OR chat_rooms.id OR linked community_messenger_rooms.id
create or replace function public.trade_can_access_trade_chat_room(p_room_id uuid)
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
        from public.product_chats pc
        where pc.id = p_room_id
          and auth.uid() in (pc.seller_id, pc.buyer_id)
      )
      or exists (
        select 1
        from public.chat_rooms cr
        where cr.id = p_room_id
          and auth.uid() in (cr.seller_id, cr.buyer_id)
      )
      or exists (
        select 1
        from public.product_chats pc
        where pc.community_messenger_room_id = p_room_id
          and auth.uid() in (pc.seller_id, pc.buyer_id)
      )
      or exists (
        select 1
        from public.chat_rooms cr
        where cr.community_messenger_room_id = p_room_id
          and auth.uid() in (cr.seller_id, cr.buyer_id)
      )
    ),
    false
  );
$$;

revoke all on function public.trade_can_access_trade_chat_room(uuid) from public;
grant execute on function public.trade_can_access_trade_chat_room(uuid) to authenticated, service_role;

comment on function public.trade_can_access_trade_chat_room(uuid) is
  'Realtime Authorization: seller/buyer of product_chats or chat_rooms (by row id or linked community_messenger_room_id). No broad cm_can_access_messenger_room.';

-- postId listing broadcast: seller of post OR party to any trade chat on that post
create or replace function public.trade_can_access_post_listing_broadcast(p_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(
    p_post_id is not null
    and auth.uid() is not null
    and (
      exists (
        select 1
        from public.posts p
        where p.id = p_post_id
          and p.user_id = auth.uid()
      )
      or exists (
        select 1
        from public.product_chats pc
        where pc.post_id = p_post_id
          and auth.uid() in (pc.seller_id, pc.buyer_id)
      )
      or exists (
        select 1
        from public.chat_rooms cr
        where cr.item_id = p_post_id
          and auth.uid() in (cr.seller_id, cr.buyer_id)
      )
    ),
    false
  );
$$;

revoke all on function public.trade_can_access_post_listing_broadcast(uuid) from public;
grant execute on function public.trade_can_access_post_listing_broadcast(uuid) to authenticated, service_role;

comment on function public.trade_can_access_post_listing_broadcast(uuid) is
  'Realtime Authorization: seller or trade-chat party may subscribe to post listing broadcast.';

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
      else false
    end,
    false
  );
$$;

revoke all on function internal.cm_realtime_can_read_topic(text) from public;
revoke all on function internal.cm_realtime_can_send_topic(text) from public;
grant execute on function internal.cm_realtime_topic_suffix_uuid(text, text) to authenticated;
grant execute on function internal.cm_realtime_can_read_topic(text) to authenticated;
grant execute on function internal.cm_realtime_can_send_topic(text) to authenticated;

alter table if exists realtime.messages enable row level security;

drop policy if exists cm_realtime_private_broadcast_select on realtime.messages;
create policy cm_realtime_private_broadcast_select
  on realtime.messages
  for select
  to authenticated
  using (
    realtime.messages.extension in ('broadcast', 'presence')
    and internal.cm_realtime_can_read_topic((select realtime.topic()))
  );

drop policy if exists cm_realtime_private_broadcast_insert on realtime.messages;
create policy cm_realtime_private_broadcast_insert
  on realtime.messages
  for insert
  to authenticated
  with check (
    realtime.messages.extension in ('broadcast', 'presence')
    and internal.cm_realtime_can_send_topic((select realtime.topic()))
  );
