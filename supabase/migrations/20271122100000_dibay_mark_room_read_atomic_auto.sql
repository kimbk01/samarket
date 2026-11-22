-- 2026-11-22 읽음 2단계 (Owner 「구현 승인」) — 방 종류·식별 키·끝 메시지를 읽음 함수 안에서 정한다.
-- 설계: docs/audit/supabase-request-surge-2026-11-18/read-mark-stage2-design-2026-11-22.md
--
-- 서버가 따로 하던 2번 조회를 대신한다:
--   ① `loadRoomDomainForUnreadAuthority` — community_messenger_rooms.chat_domain·domain_identity_key
--   ② `resolveRoomReadableTipMessageId` — 삭제 안 된 마지막 메시지(created_at desc, id desc) · 없으면 'empty'
-- 그리고 같은 형식의 중복 방지 키(`buildCmMarkReadIdempotencyKey`)를 만들어 **기존 `dibay_mark_room_read_atomic` 을 그대로** 부른다.
-- 일반 1:1·그룹·거래가 아니거나 식별 키가 없거나 방이 없으면 아무것도 쓰지 않고 `unsupported_domain` → 서버가 이전 경로로.
-- 권한: SECURITY INVOKER · service_role 전용(서버 클라이언트) — 안쪽 함수가 지금처럼 역할·사용자를 검사한다.

create or replace function public.dibay_mark_room_read_atomic_auto(
  p_viewer_id uuid,
  p_room_id uuid,
  p_read_through_message_id uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_domain text;
  v_identity text;
  v_tip text;
  v_key text;
begin
  if p_viewer_id is null or p_room_id is null then
    return jsonb_build_object('ok', false, 'error', 'bad_args');
  end if;

  select btrim(coalesce(r.chat_domain, '')), btrim(coalesce(r.domain_identity_key, ''))
    into v_domain, v_identity
  from public.community_messenger_rooms r
  where r.id = p_room_id;

  if not found or v_domain not in ('general_direct', 'group', 'trade') or v_identity = '' then
    return jsonb_build_object('ok', false, 'error', 'unsupported_domain');
  end if;

  if p_read_through_message_id is null then
    select m.id::text into v_tip
    from public.community_messenger_messages m
    where m.room_id = p_room_id and m.deleted_at is null
    order by m.created_at desc, m.id desc
    limit 1;
    v_key := 'cm_mark_read:' || p_viewer_id::text || ':' || p_room_id::text || ':open:' || coalesce(nullif(v_tip, ''), 'empty');
  else
    v_key := 'cm_mark_read:' || p_viewer_id::text || ':' || p_room_id::text || ':' || p_read_through_message_id::text;
  end if;

  return public.dibay_mark_room_read_atomic(
    p_viewer_id,
    p_room_id,
    v_domain,
    v_identity,
    'member',
    null,
    null,
    p_read_through_message_id,
    v_key
  );
end;
$$;

revoke all on function public.dibay_mark_room_read_atomic_auto(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.dibay_mark_room_read_atomic_auto(uuid, uuid, uuid) to service_role;
