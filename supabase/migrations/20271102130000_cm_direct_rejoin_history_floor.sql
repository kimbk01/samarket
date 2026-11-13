-- S-2 H (Owner 「S-2 전체 승인」 2026-11-02) — 1:1 나가기 후 재참가 기록 하한 `participants.cleared_at`
-- 「나만 대화 삭제」·카카오 나가기: 다시 참가한 사람은 다시 참가한 시각 이후 메시지만 본다.
-- 규칙은 이미 운영 중인 `get_community_messenger_room_bootstrap_snapshot` 과 같다: created_at > cleared_at 만 보임.
-- cleared_at 이 null 이면 모든 변경이 무동작(기존 기록 그대로).
-- 설계: docs/audit/messenger-2026-11-02-s2-leave-history-call-design.md §H

-- 0) 운영에 이미 있는 열 — 마이그레이션 파일에 없던 스키마 불일치 해소(운영 무변경)
ALTER TABLE public.community_messenger_participants
  ADD COLUMN IF NOT EXISTS cleared_at timestamptz NULL;

COMMENT ON COLUMN public.community_messenger_participants.cleared_at IS
  '기록 하한: 이 참가자에게는 created_at > cleared_at 메시지만 보인다(1:1 나가기 후 재참가 시 설정). null = 전체 기록.';

-- 1) 「이후」 메시지 — 기기에 남은 옛 메시지 id 로 불러도 하한 이전은 나오지 않음
CREATE OR REPLACE FUNCTION public.community_messenger_room_messages_after(p_user_id uuid, p_room_id uuid, p_after_message_id uuid, p_limit integer)
 RETURNS SETOF community_messenger_messages
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select m.*
  from public.community_messenger_messages m
  where m.room_id = p_room_id
    and m.deleted_at is null
    and exists (
      select 1
      from public.community_messenger_participants p
      where p.room_id = p_room_id
        and p.user_id = p_user_id
    )
    and not exists (
      select 1
      from public.community_messenger_participants p
      where p.room_id = p_room_id
        and p.user_id = p_user_id
        and p.cleared_at is not null
        and m.created_at <= p.cleared_at
    )
    and exists (
      select 1
      from public.community_messenger_messages a
      where a.id = p_after_message_id
        and a.room_id = p_room_id
    )
    and (
      m.created_at,
      m.id
    ) > (
      select a.created_at, a.id
      from public.community_messenger_messages a
      where a.id = p_after_message_id
        and a.room_id = p_room_id
    )
  order by m.created_at asc, m.id asc
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
$function$;

-- 2) 홈 목록 lite 묶음 — critical·full·home-sync 스냅샷이 모두 이 함수를 쓴다.
--    하한 이전 마지막 메시지는 미리보기를 비우고, 참가 행에 cleared_at 을 실어 서버 요약도 같은 규칙을 쓰게 한다.
CREATE OR REPLACE FUNCTION public.community_messenger_bootstrap_lite_my_rooms_bundle(p_user_id uuid, p_limit integer DEFAULT 500)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with ranked as (
    select
      p.room_id,
      r.id,
      r.room_type,
      r.room_status,
      r.is_readonly,
      r.direct_key,
      r.chat_domain,
      r.domain_identity_key,
      r.title,
      r.created_by,
      r.owner_user_id,
      case
        when p.cleared_at is not null and (r.last_message_at is null or r.last_message_at <= p.cleared_at) then null
        else r.last_message
      end as last_message,
      r.last_message_at,
      case
        when p.cleared_at is not null and (r.last_message_at is null or r.last_message_at <= p.cleared_at) then null
        else r.last_message_type
      end as last_message_type,
      count(*) over ()::integer as membership_total_count,
      row_number() over (
        order by r.last_message_at desc nulls last, p.room_id asc
      ) as rn
    from public.community_messenger_participants p
    join public.community_messenger_rooms r on r.id = p.room_id
    where p.user_id = p_user_id
      and p.left_at is null
      and p.blocked_hidden_at is null
  ),
  capped as (
    select *
    from ranked
    where rn <= least(greatest(coalesce(p_limit, 500), 0), 500)
  ),
  capped_room_ids as (
    select room_id from capped
  ),
  participant_user_ids as (
    select distinct p.user_id
    from public.community_messenger_participants p
    where p.room_id in (select room_id from capped_room_ids)
    union
    select p_user_id
  ),
  room_arr as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', c.id,
          'room_type', c.room_type,
          'room_status', c.room_status,
          'is_readonly', c.is_readonly,
          'direct_key', c.direct_key,
          'chat_domain', c.chat_domain,
          'domain_identity_key', c.domain_identity_key,
          'title', c.title,
          'created_by', c.created_by,
          'owner_user_id', c.owner_user_id,
          'last_message', c.last_message,
          'last_message_at', c.last_message_at,
          'last_message_type', c.last_message_type
        )
        order by c.last_message_at desc nulls last, c.id asc
      ),
      '[]'::jsonb
    ) as rooms
    from capped c
  ),
  participant_arr as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'room_id', p.room_id,
          'user_id', p.user_id,
          'unread_count', p.unread_count,
          'is_muted', p.is_muted,
          'is_pinned', p.is_pinned,
          'is_archived', p.is_archived,
          'cleared_at', case when p.user_id = p_user_id then p.cleared_at else null end
        )
      ),
      '[]'::jsonb
    ) as participants
    from public.community_messenger_participants p
    where p.room_id in (select room_id from capped_room_ids)
  ),
  profile_labels as (
    select coalesce(
      jsonb_object_agg(
        pr.id::text,
        jsonb_build_object(
          'id', pr.id,
          'display_name', pr.display_name,
          'nickname', pr.nickname,
          'username', pr.username,
          'avatar_url', pr.avatar_url
        )
      ),
      '{}'::jsonb
    ) as profiles
    from public.profiles pr
    where pr.id in (select user_id from participant_user_ids)
  )
  select jsonb_build_object(
    'membership_total_count', (select max(membership_total_count) from ranked),
    'room_ids', (
      select coalesce(
        jsonb_agg(c.room_id order by c.last_message_at desc nulls last, c.room_id asc),
        '[]'::jsonb
      )
      from capped c
    ),
    'rooms', (select rooms from room_arr),
    'participants', (select participants from participant_arr),
    'profile_labels', (select profiles from profile_labels)
  );
$function$;

-- 3) 안 읽음 수 — 하한 이전 메시지는 세지 않음(INSERT 재참가는 joined_at 으로 이미 걸러지나 left_at 되살림 경로는 joined_at 이 그대로)
CREATE OR REPLACE FUNCTION public.dibay_cm_canonical_unread_count(p_room_id uuid, p_viewer_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cursor_id uuid;
  v_cursor_at timestamptz;
  v_joined_at timestamptz;
  v_left_at timestamptz;
  v_cleared_at timestamptz;
  v_count int;
  v_count_system boolean;
BEGIN
  IF p_room_id IS NULL OR p_viewer_id IS NULL THEN
    RETURN 0;
  END IF;

  SELECT p.last_read_message_id, p.joined_at, p.left_at, p.cleared_at
    INTO v_cursor_id, v_joined_at, v_left_at, v_cleared_at
  FROM public.community_messenger_participants p
  WHERE p.room_id = p_room_id AND p.user_id = p_viewer_id;

  IF NOT FOUND OR v_left_at IS NOT NULL THEN
    RETURN 0;
  END IF;

  SELECT coalesce(r.chat_domain IN ('store_order', 'trade'), false)
    INTO v_count_system
  FROM public.community_messenger_rooms r
  WHERE r.id = p_room_id;
  v_count_system := coalesce(v_count_system, false);

  IF v_cursor_id IS NOT NULL THEN
    SELECT m.created_at INTO v_cursor_at
    FROM public.community_messenger_messages m
    WHERE m.id = v_cursor_id AND m.room_id = p_room_id;
  END IF;

  SELECT count(*)::int INTO v_count
  FROM public.community_messenger_messages m
  WHERE m.room_id = p_room_id
    AND m.deleted_at IS NULL
    AND m.sender_id IS DISTINCT FROM p_viewer_id
    AND (v_count_system OR m.message_type IS DISTINCT FROM 'system')
    AND (v_joined_at IS NULL OR m.created_at >= v_joined_at)
    AND (v_cleared_at IS NULL OR m.created_at > v_cleared_at)
    AND (
      v_cursor_id IS NULL
      OR v_cursor_at IS NULL
      OR m.created_at > v_cursor_at
      OR (m.created_at = v_cursor_at AND m.id > v_cursor_id)
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.community_messenger_membership_leave_intervals g
      WHERE g.room_id = p_room_id
        AND g.user_id = p_viewer_id
        AND g.rejoined_at IS NOT NULL
        AND m.created_at >= g.left_at
        AND m.created_at < g.rejoined_at
    );

  RETURN coalesce(v_count, 0);
END;
$function$;

-- 4) 실시간·직접 조회 권한 — 하한 이전 메시지 행은 이 참가자에게 SELECT 되지 않음
--    (상대가 옛 메시지를 수정·삭제해도 다시 참가한 사람에게 실시간 이벤트가 가지 않는다). 쓰기 검사(with_check)는 그대로.
CREATE OR REPLACE FUNCTION internal.cm_message_above_viewer_history_floor(p_room_id uuid, p_created_at timestamptz)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT NOT EXISTS (
    SELECT 1
    FROM public.community_messenger_participants p
    WHERE p.room_id = p_room_id
      AND p.user_id = auth.uid()
      AND p.cleared_at IS NOT NULL
      AND p_created_at <= p.cleared_at
  );
$function$;

GRANT EXECUTE ON FUNCTION internal.cm_message_above_viewer_history_floor(uuid, timestamptz) TO anon, authenticated, service_role;

ALTER POLICY community_messenger_messages_member_policy ON public.community_messenger_messages
  USING (
    internal.cm_can_access_messenger_room(room_id)
    AND internal.cm_message_above_viewer_history_floor(room_id, created_at)
  )
  WITH CHECK (internal.cm_can_access_messenger_room(room_id));

-- 되돌리기(이전 정의): room_messages_after 20270505121000 · lite bundle 20260921170000 ·
-- unread count 20270505122000 · policy USING/WITH CHECK = internal.cm_can_access_messenger_room(room_id)
