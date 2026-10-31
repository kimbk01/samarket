-- 메신저 방 접근 확인 1회 조회 — 요청 증폭 근본 수정 1-B.
-- 계획: docs/audit/messenger-room-check-fanout-fix-plan-2026-10-31.md 「1-B」 (Owner 승인 2026-10-31)
-- 이전: 방 API 요청마다 participants(room_id,user_id,left_at) · rooms(id,room_type) 를 따로 읽고,
--       그룹이면 group_bans(id) · participants(활성·숨김 아님) 를 더 읽고, 진입(bootstrap·room GET)은
--       rooms(room_type,deleted_at) · group_bans(id) 를 한 번 더 읽었다.
-- 이 함수는 같은 표·같은 조건의 행만 한 번에 읽는다. 판정(참가·그룹 활성 멤버·삭제·강퇴)은 호출자 TS 가 그대로 한다.
-- p_room_key 가 uuid 가 아니면(거래 레거시 id) room_exists=false — 호출자는 기존 거래 연결 경로로 간다.

create or replace function public.community_messenger_room_access(p_user_id uuid, p_room_key text)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_room_id uuid;
  v_room record;
  v_part record;
  v_banned boolean;
begin
  if p_room_key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return jsonb_build_object('room_exists', false, 'participant_active', false);
  end if;
  v_room_id := p_room_key::uuid;

  select r.id, r.room_type, r.deleted_at
    into v_room
    from public.community_messenger_rooms r
   where r.id = v_room_id;

  -- community_messenger_participants_room_id_user_id_key: (room_id, user_id) 당 1행
  select p.id, p.room_id, p.user_id, p.role, p.unread_count, p.is_muted, p.is_pinned, p.left_at, p.blocked_hidden_at
    into v_part
    from public.community_messenger_participants p
   where p.room_id = v_room_id and p.user_id = p_user_id;

  -- community_messenger_group_bans_one_active_uidx: (room_id, user_id) 활성 강퇴 최대 1행
  select exists (
    select 1 from public.community_messenger_group_bans b
     where b.room_id = v_room_id and b.user_id = p_user_id and b.unbanned_at is null
  ) into v_banned;

  return jsonb_build_object(
    'room_exists', v_room.id is not null,
    'room_type', v_room.room_type,
    'deleted_at', v_room.deleted_at,
    -- 기존 participants(room_id,user_id, left_at is null) 와 같은 조건
    'participant_active', v_part.id is not null and v_part.left_at is null,
    -- 기존 fetchActiveParticipant(left_at is null and blocked_hidden_at is null) 와 같은 조건·열
    'group_participant', case
      when v_part.id is not null and v_part.left_at is null and v_part.blocked_hidden_at is null then
        jsonb_build_object(
          'id', v_part.id,
          'room_id', v_part.room_id,
          'user_id', v_part.user_id,
          'role', v_part.role,
          'unread_count', v_part.unread_count,
          'is_muted', v_part.is_muted,
          'is_pinned', v_part.is_pinned,
          'left_at', v_part.left_at
        )
      else null
    end,
    'banned', v_banned
  );
end;
$$;

revoke all on function public.community_messenger_room_access(uuid, text) from public, anon, authenticated;
grant execute on function public.community_messenger_room_access(uuid, text) to service_role;
