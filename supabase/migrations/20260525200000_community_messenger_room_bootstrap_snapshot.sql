-- Room bootstrap critical: single-RPC snapshot (1 PostgREST RTT cold path).
-- Semantics aligned with loadCommunityMessengerRoomSnapshotUncached snapshotTier=critical wave A.

CREATE TABLE IF NOT EXISTS public.community_messenger_room_bootstrap_snapshots (
  user_id uuid NOT NULL,
  room_id uuid NOT NULL,
  snapshot_tier text NOT NULL DEFAULT 'critical',
  message_limit integer NOT NULL DEFAULT 24,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, room_id, snapshot_tier, message_limit)
);

COMMENT ON TABLE public.community_messenger_room_bootstrap_snapshots IS
  'Precomputed room bootstrap critical payload (room + participants + messages). Event-driven refresh; read path 1 PK select.';

CREATE INDEX IF NOT EXISTS idx_cm_room_bootstrap_snapshots_updated
  ON public.community_messenger_room_bootstrap_snapshots (updated_at DESC);

ALTER TABLE public.community_messenger_room_bootstrap_snapshots ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.get_community_messenger_room_bootstrap_snapshot(
  p_user_id uuid,
  p_room_id uuid,
  p_snapshot_tier text DEFAULT 'critical',
  p_message_limit integer DEFAULT 24
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH cap AS (
    SELECT least(greatest(coalesce(p_message_limit, 24), 1), 30)::integer AS msg_limit,
           60::integer AS member_cap
  ),
  membership AS (
    SELECT EXISTS (
      SELECT 1
      FROM public.community_messenger_participants mp
      WHERE mp.room_id = p_room_id
        AND mp.user_id = p_user_id
    ) AS ok
  ),
  room_row AS (
    SELECT r.*
    FROM public.community_messenger_rooms r
    WHERE r.id = p_room_id
      AND (SELECT ok FROM membership)
  ),
  participant_ranked AS (
    SELECT
      p.id,
      p.room_id,
      p.user_id,
      p.role,
      p.unread_count,
      p.is_muted,
      p.is_pinned,
      p.is_archived,
      p.joined_at,
      p.last_read_at,
      p.last_read_message_id,
      pr.id AS profile_id,
      pr.nickname,
      pr.username,
      pr.avatar_url,
      pr.display_name,
      (p.user_id = p_user_id) AS is_viewer
    FROM public.community_messenger_participants p
    LEFT JOIN public.profiles pr ON pr.id = p.user_id
    WHERE p.room_id = p_room_id
      AND (SELECT ok FROM membership)
    ORDER BY p.is_pinned DESC NULLS LAST, p.joined_at ASC NULLS LAST, p.user_id ASC
    LIMIT (SELECT member_cap + 1 FROM cap)
  ),
  viewer_participant AS (
    SELECT *
    FROM participant_ranked
    WHERE is_viewer
    LIMIT 1
  ),
  participant_capped AS (
    SELECT *
    FROM (
      SELECT * FROM participant_ranked
      LIMIT (SELECT member_cap FROM cap)
    ) sub
    UNION
    SELECT vp.*
    FROM viewer_participant vp
    WHERE NOT EXISTS (
      SELECT 1 FROM participant_ranked pr2
      WHERE pr2.user_id = p_user_id
      LIMIT (SELECT member_cap FROM cap)
    )
  ),
  participant_arr AS (
    SELECT coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', pc.id,
          'room_id', pc.room_id,
          'user_id', pc.user_id,
          'role', pc.role,
          'unread_count', pc.unread_count,
          'is_muted', pc.is_muted,
          'is_pinned', pc.is_pinned,
          'is_archived', pc.is_archived,
          'joined_at', pc.joined_at,
          'last_read_at', pc.last_read_at,
          'last_read_message_id', pc.last_read_message_id,
          'profiles', CASE
            WHEN pc.profile_id IS NOT NULL THEN jsonb_build_object(
              'id', pc.profile_id,
              'nickname', pc.nickname,
              'username', pc.username,
              'avatar_url', pc.avatar_url,
              'display_name', pc.display_name
            )
            ELSE NULL
          END
        )
      ),
      '[]'::jsonb
    ) AS participants
    FROM participant_capped pc
  ),
  message_rows AS (
    SELECT m.*
    FROM public.community_messenger_messages m
    WHERE m.room_id = p_room_id
      AND m.deleted_at IS NULL
      AND (SELECT ok FROM membership)
    ORDER BY m.created_at DESC, m.id DESC
    LIMIT (SELECT msg_limit FROM cap)
  ),
  message_arr AS (
    SELECT coalesce(
      jsonb_agg(to_jsonb(mr) ORDER BY mr.created_at ASC, mr.id ASC),
      '[]'::jsonb
    ) AS messages
    FROM (
      SELECT * FROM message_rows
      ORDER BY created_at ASC, id ASC
    ) mr
  ),
  msg_count AS (
    SELECT count(*)::integer AS n FROM message_rows
  ),
  room_json AS (
    SELECT to_jsonb(r) AS room
    FROM room_row r
  )
  SELECT CASE
    WHEN NOT (SELECT ok FROM membership) THEN NULL::jsonb
    WHEN NOT EXISTS (SELECT 1 FROM room_row) THEN NULL::jsonb
    ELSE jsonb_build_object(
      'room', (SELECT room FROM room_json),
      'participants', (SELECT participants FROM participant_arr),
      'messages', (SELECT messages FROM message_arr),
      'message_limit', (SELECT msg_limit FROM cap),
      'has_more_older_messages', (SELECT n FROM msg_count) >= (SELECT msg_limit FROM cap),
      'snapshot_tier', coalesce(nullif(trim(p_snapshot_tier), ''), 'critical'),
      'viewer_unread_count', coalesce(
        (SELECT greatest(vp.unread_count, 0) FROM viewer_participant vp),
        0
      ),
      'updated_at', now()
    )
  END;
$$;

COMMENT ON FUNCTION public.get_community_messenger_room_bootstrap_snapshot(uuid, uuid, text, integer) IS
  'Room bootstrap critical cold path — room + capped participants (profile labels) + recent messages in one SQL snapshot.';

REVOKE ALL ON FUNCTION public.get_community_messenger_room_bootstrap_snapshot(uuid, uuid, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_community_messenger_room_bootstrap_snapshot(uuid, uuid, text, integer) FROM anon;
REVOKE ALL ON FUNCTION public.get_community_messenger_room_bootstrap_snapshot(uuid, uuid, text, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_community_messenger_room_bootstrap_snapshot(uuid, uuid, text, integer) TO service_role;
