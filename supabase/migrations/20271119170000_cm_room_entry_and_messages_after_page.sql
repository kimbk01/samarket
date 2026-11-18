-- D4 ②③ (Owner 「②③ 승인」 2026-11-19) — 메신저 방 진입·이어받기를 DB 함수 1번 호출로.
-- 설계: docs/audit/supabase-request-surge-2026-11-18/d4-room-entry-analysis-2026-11-19.md §3 ②③
--
-- 원칙: 새 계산을 만들지 않는다. 지금 서버가 따로 부르는 **기존 함수를 그대로 안에서 부르고**,
-- 지금 TS 가 직접 읽는 표는 **같은 조건**으로 읽어 한 jsonb 로 돌려준다. 판정·가공은 TS 에 그대로 둔다.
-- 이 단계는 화면을 바꾸지 않는다 — 라우트가 일부 요청에서 기존 결과와 비교만 한다(그림자).
--
-- ② community_messenger_room_entry — bootstrap critical 단계용
--    = room_access(1,120/18h) + get_community_messenger_room_bootstrap_snapshot(909)
--      + 1:1: direct_pair_facts(683) — 방의 다른 참가자마다(보통 1명), TS 가 자기 peer 로 고른다
--      + 그룹: 활성 참가자·강퇴·접속 스냅샷 원본(participants 452 · bans 226 · presence 226)
-- ③ community_messenger_room_messages_after_page — messages?after= 용
--    = 기준 메시지 숨김(hides) + room_messages_after(390) + 페이지 숨김·반응·보낸 사람 프로필

begin;

create or replace function public.community_messenger_room_entry(
  p_user_id uuid,
  p_room_key text,
  p_message_limit integer default 24
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_access jsonb;
  v_room_id uuid;
  v_room_type text;
  v_snapshot jsonb;
  v_pair jsonb := '{}'::jsonb;
  v_group jsonb := null;
begin
  -- 기존 권한 함수 그대로 (uuid 가 아니면 room_exists=false 를 돌려준다)
  v_access := public.community_messenger_room_access(p_user_id, p_room_key);

  if not coalesce((v_access ->> 'room_exists')::boolean, false)
     or not coalesce((v_access ->> 'participant_active')::boolean, false)
     or (v_access ->> 'deleted_at') is not null then
    return jsonb_build_object('access', v_access);
  end if;

  v_room_type := v_access ->> 'room_type';
  if v_room_type is distinct from 'direct' and coalesce((v_access ->> 'banned')::boolean, false) then
    return jsonb_build_object('access', v_access);
  end if;

  v_room_id := p_room_key::uuid;
  v_snapshot := public.get_community_messenger_room_bootstrap_snapshot(
    p_user_id, v_room_id, 'critical', p_message_limit
  );

  if v_room_type = 'direct' then
    select coalesce(
             jsonb_object_agg(x.user_id::text,
               public.community_messenger_direct_pair_facts(p_user_id, x.user_id, p_room_key)),
             '{}'::jsonb)
      into v_pair
      from (
        select distinct p.user_id
          from public.community_messenger_participants p
         where p.room_id = v_room_id
           and p.user_id <> p_user_id
         limit 4
      ) x;
  else
    -- group-room-online-authority.ts resolveGroupRoomOnlineAuthority 와 같은 세 조회
    with active as (
      select p.user_id
        from public.community_messenger_participants p
       where p.room_id = v_room_id and p.left_at is null
    ),
    banned as (
      select b.user_id
        from public.community_messenger_group_bans b
       where b.room_id = v_room_id and b.unbanned_at is null
    )
    select jsonb_build_object(
      'active_user_ids', coalesce((select jsonb_agg(a.user_id) from active a), '[]'::jsonb),
      'banned_user_ids', coalesce((select jsonb_agg(b.user_id) from banned b), '[]'::jsonb),
      'presence_rows', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'user_id', s.user_id,
                 'last_seen_at', s.last_seen_at,
                 'updated_at', s.updated_at,
                 'last_ping_at', s.last_ping_at,
                 'last_activity_at', s.last_activity_at,
                 'app_visibility', s.app_visibility))
          from public.community_messenger_presence_snapshots s
         where s.user_id in (select a.user_id from active a
                              where a.user_id not in (select b.user_id from banned b))
      ), '[]'::jsonb)
    ) into v_group;
  end if;

  return jsonb_build_object(
    'access', v_access,
    'snapshot', v_snapshot,
    'pair_facts_by_peer', v_pair,
    'group_online', v_group
  );
end;
$$;

revoke all on function public.community_messenger_room_entry(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.community_messenger_room_entry(uuid, text, integer) to service_role;

create or replace function public.community_messenger_room_messages_after_page(
  p_user_id uuid,
  p_room_id uuid,
  p_after_message_id uuid,
  p_limit integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_rows jsonb;
  v_ids uuid[];
  v_senders uuid[];
begin
  -- service.ts listCommunityMessengerRoomMessagesAfter: 기준 메시지를 숨겼으면 not_found
  if exists (
    select 1 from public.community_messenger_message_user_hides h
     where h.user_id = p_user_id and h.message_id = p_after_message_id
  ) then
    return jsonb_build_object('anchor_hidden', true);
  end if;

  select coalesce(jsonb_agg(to_jsonb(m) order by m.created_at asc, m.id asc), '[]'::jsonb),
         coalesce(array_agg(m.id), '{}'),
         coalesce(array_agg(distinct m.sender_id) filter (where m.sender_id is not null), '{}')
    into v_rows, v_ids, v_senders
    from public.community_messenger_room_messages_after(p_user_id, p_room_id, p_after_message_id, p_limit) m;

  return jsonb_build_object(
    'anchor_hidden', false,
    'rows', v_rows,
    'hidden_message_ids', coalesce((
      select jsonb_agg(h.message_id)
        from public.community_messenger_message_user_hides h
       where h.user_id = p_user_id and h.message_id = any (v_ids)
    ), '[]'::jsonb),
    'reaction_rows', coalesce((
      select jsonb_agg(jsonb_build_object(
               'message_id', r.message_id, 'user_id', r.user_id,
               'reaction_key', r.reaction_key, 'created_at', r.created_at))
        from public.community_messenger_message_reactions r
       where r.message_id = any (v_ids)
    ), '[]'::jsonb),
    'profile_rows', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', pr.id, 'nickname', pr.nickname, 'dibay_id', pr.dibay_id,
               'avatar_url', pr.avatar_url, 'display_name', pr.display_name, 'username', pr.username))
        from public.profiles pr
       where pr.id = any (v_senders)
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.community_messenger_room_messages_after_page(uuid, uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.community_messenger_room_messages_after_page(uuid, uuid, uuid, integer) to service_role;

commit;
