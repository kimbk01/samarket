-- 1:1 방 상대 관계 1회 조회 — 요청 증폭 근본 수정 1-C.
-- 계획: docs/audit/messenger-room-check-fanout-fix-plan-2026-10-31.md 「1-C」 (Owner 승인 2026-10-31)
-- 이전: 1:1 방 진입·통화 권한이 차단 쌍 · 친구 저장(나→상대, 상대→나) · 거절된 친구 요청 · 대기 요청 ·
--       상대 안내 닫힘 · 상대 통화 정책 · 두 사람 계정 상태 · 방 상태/참가자 를 각각 읽었다 (1:1 진입 1회 = 9회).
-- 이 함수는 같은 표·같은 조건의 행만 한 번에 읽는다. 판정(차단·친구·거절·통화 허용)은 호출자 TS 가 그대로 한다.
-- 모든 쌍 조건은 고유 색인으로 행이 최대 1개다:
--   user_social_relations (owner_user_id, target_user_id) · community_friend_requests (requester_id, addressee_id) ·
--   community_messenger_peer_notices (viewer_user_id, peer_user_id, room_id, notice_type).
-- p_room_key 가 uuid 가 아니거나 null 이면 방 관련 값은 비운다(room_exists=false).

create or replace function public.community_messenger_direct_pair_facts(
  p_viewer_id uuid,
  p_peer_id uuid,
  p_room_key text default null
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_room_id uuid;
  v_room_found boolean := false;
  v_room_type text;
  v_room_status text;
  v_room_readonly boolean;
  v_pending record;
  v_viewer_rel record;
  v_peer_rel record;
begin
  -- user_social_relations: 방향당 1행 (차단·친구 판정은 relation_type 으로 호출자가 가른다)
  select r.relation_type, r.is_active into v_viewer_rel
    from public.user_social_relations r
   where r.owner_user_id = p_viewer_id and r.target_user_id = p_peer_id;
  select r.relation_type, r.is_active into v_peer_rel
    from public.user_social_relations r
   where r.owner_user_id = p_peer_id and r.target_user_id = p_viewer_id;

  -- fetchPendingFriendRequestBetween: 양방향 pending 중 최신 1건
  select q.id, q.requester_id into v_pending
    from public.community_friend_requests q
   where q.status = 'pending'
     and ((q.requester_id = p_viewer_id and q.addressee_id = p_peer_id)
       or (q.requester_id = p_peer_id and q.addressee_id = p_viewer_id))
   order by q.created_at desc
   limit 1;

  if p_room_key is not null
     and p_room_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_room_id := p_room_key::uuid;
    select true, rm.room_type, rm.room_status, rm.is_readonly
      into v_room_found, v_room_type, v_room_status, v_room_readonly
      from public.community_messenger_rooms rm
     where rm.id = v_room_id;
    v_room_found := coalesce(v_room_found, false);
  end if;

  return jsonb_build_object(
    -- fetchBlockedPairFromSb: relation_type=blocked 이고 is_active 가 false 가 아닌 행
    'blocked_by_viewer', coalesce(v_viewer_rel.relation_type = 'blocked' and v_viewer_rel.is_active is distinct from false, false),
    'blocked_by_peer', coalesce(v_peer_rel.relation_type = 'blocked' and v_peer_rel.is_active is distinct from false, false),
    -- isFriendSavedByOwner: relation_type=friend 행 존재 (is_active 조건 없음 — 기존 쿼리와 같다)
    'saved_by_viewer', coalesce(v_viewer_rel.relation_type = 'friend', false),
    'saved_by_peer', coalesce(v_peer_rel.relation_type = 'friend', false),
    -- fetchFriendRequestRejectedByPeer(viewer→peer): 내가 보낸 요청을 상대가 거절
    'rejected_by_peer', exists (
      select 1 from public.community_friend_requests q
       where q.requester_id = p_viewer_id and q.addressee_id = p_peer_id and q.status = 'rejected'
    ),
    'pending_request_id', v_pending.id,
    'pending_requester_id', v_pending.requester_id,
    -- fetchProfilesRestrictedPair · fetchCalleeCallPolicy
    'viewer_status', (select p.status from public.profiles p where p.id = p_viewer_id),
    'peer_status', (select p.status from public.profiles p where p.id = p_peer_id),
    'peer_call_policy', (select p.messenger_direct_call_policy from public.profiles p where p.id = p_peer_id),
    -- isUnknownPeerNoticeDismissed
    'unknown_peer_notice_dismissed_at', case when v_room_id is null then null else (
      select n.dismissed_at from public.community_messenger_peer_notices n
       where n.viewer_user_id = p_viewer_id and n.peer_user_id = p_peer_id
         and n.room_id = v_room_id and n.notice_type = 'unknown_peer'
    ) end,
    -- loadRoomParticipantContext: 방 상태 + 참가 행 존재(left_at 조건 없음 — 기존 쿼리와 같다)
    'room_exists', v_room_found,
    'room_type', v_room_type,
    'room_status', v_room_status,
    'room_is_readonly', v_room_readonly,
    'viewer_in_room', case when not v_room_found then false else exists (
      select 1 from public.community_messenger_participants x where x.room_id = v_room_id and x.user_id = p_viewer_id
    ) end,
    'peer_in_room', case when not v_room_found then false else exists (
      select 1 from public.community_messenger_participants x where x.room_id = v_room_id and x.user_id = p_peer_id
    ) end
  );
end;
$$;

revoke all on function public.community_messenger_direct_pair_facts(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.community_messenger_direct_pair_facts(uuid, uuid, text) to service_role;
