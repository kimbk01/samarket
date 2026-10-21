-- 메신저 감사 G-1 (docs/dibay-messenger-full-audit-2026-10-21.md 1부 B-9·2부 H-6) — 그룹 방장 위임이 항상 실패
-- 원인(운영 RPC 본문 확인 2026-10-21): community_messenger_transfer_group_owner 는 auth.uid() 로 권한을 보는데
--   EXECUTE 가 authenticated 에서 회수되어(20260808121000) 서버(service_role)만 호출 → auth.uid() IS NULL → 항상 'unauthorized'.
-- 수정: actor 를 명시 인자로 받는 새 함수(기존 함수는 유지 — 롤백 = 웹 코드가 구 RPC 호출로 되돌림).
--   · 방 행 FOR UPDATE 로 동시 위임 직렬화
--   · actor: 활성 참가자(left_at IS NULL) + role='owner' + private_group
--   · target: 활성 참가자(구 함수는 left_at 미확인 — 나간 사람에게 위임 가능하던 결함 포함 수정)
-- 운영 적용: Owner 별도 명시 승인 후(D6).
BEGIN;

CREATE OR REPLACE FUNCTION public.community_messenger_transfer_group_owner_as_actor(
  p_room_id uuid,
  p_actor_user_id uuid,
  p_next_owner_user_id uuid
)
RETURNS TABLE(ok boolean, error text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_room_type text;
  v_actor_role text;
  v_target_role text;
begin
  if p_actor_user_id is null then
    return query select false, 'unauthorized';
    return;
  end if;
  if p_next_owner_user_id is null then
    return query select false, 'target_required';
    return;
  end if;
  if p_next_owner_user_id = p_actor_user_id then
    return query select false, 'same_owner';
    return;
  end if;

  select r.room_type into v_room_type
  from public.community_messenger_rooms r
  where r.id = p_room_id
  for update;
  if v_room_type is null then
    return query select false, 'room_not_found';
    return;
  end if;
  if v_room_type <> 'private_group' then
    return query select false, 'not_group_room';
    return;
  end if;

  select p.role into v_actor_role
  from public.community_messenger_participants p
  where p.room_id = p_room_id and p.user_id = p_actor_user_id and p.left_at is null
  limit 1;
  if v_actor_role is distinct from 'owner' then
    return query select false, 'forbidden';
    return;
  end if;

  select p.role into v_target_role
  from public.community_messenger_participants p
  where p.room_id = p_room_id and p.user_id = p_next_owner_user_id and p.left_at is null
  limit 1;
  if v_target_role is null then
    return query select false, 'target_not_found';
    return;
  end if;

  update public.community_messenger_participants
  set role = 'admin'
  where room_id = p_room_id and user_id = p_actor_user_id;

  update public.community_messenger_participants
  set role = 'owner'
  where room_id = p_room_id and user_id = p_next_owner_user_id;

  update public.community_messenger_rooms
  set owner_user_id = p_next_owner_user_id, updated_at = now()
  where id = p_room_id;

  return query select true, null::text;
end;
$function$;

REVOKE ALL ON FUNCTION public.community_messenger_transfer_group_owner_as_actor(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.community_messenger_transfer_group_owner_as_actor(uuid, uuid, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.community_messenger_transfer_group_owner_as_actor(uuid, uuid, uuid) TO service_role;

COMMIT;

-- 롤백: DROP FUNCTION public.community_messenger_transfer_group_owner_as_actor(uuid, uuid, uuid);
