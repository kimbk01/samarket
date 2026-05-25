-- FBT1: CM bootstrap full tier snapshot — tier-aware unified RPC (1 PostgREST RTT).
-- p_tier=critical → rooms+unread bundle (cap 30). p_tier=full → full monolith bundle.

CREATE OR REPLACE FUNCTION public.get_cm_bootstrap_full_snapshot(
  p_user_id uuid,
  p_cursor text DEFAULT '',
  p_limit integer DEFAULT 500,
  p_tier text DEFAULT 'full'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tier text := lower(trim(coalesce(p_tier, 'full')));
  v_cap integer;
  v_lite jsonb;
  v_hs5 jsonb;
  v_pc_ids uuid[];
  v_cm_ids uuid[];
  v_trade_context jsonb;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'user_required', 'updated_at', now());
  END IF;

  IF v_tier = 'critical' THEN
    v_cap := least(greatest(coalesce(p_limit, 30), 1), 30);
  ELSE
    v_cap := least(greatest(coalesce(p_limit, 500), 1), 500);
  END IF;

  v_lite := public.community_messenger_bootstrap_lite_my_rooms_bundle(p_user_id, v_cap);

  SELECT coalesce(array_agg(DISTINCT (r->>'id')::uuid) FILTER (WHERE (r->>'id') IS NOT NULL), '{}'::uuid[])
  INTO v_cm_ids
  FROM jsonb_array_elements(coalesce(v_lite->'rooms', '[]'::jsonb)) AS r
  WHERE coalesce(r->>'room_type', '') = 'direct'
    AND (
      trim(coalesce(r->>'direct_key', '')) LIKE 'trade_pc:%'
      OR trim(coalesce(r->>'direct_key', '')) LIKE 'trade_item:%'
    );

  SELECT coalesce(
    array_agg(DISTINCT (substring(trim(r->>'direct_key') FROM 10))::uuid)
      FILTER (
        WHERE trim(coalesce(r->>'direct_key', '')) LIKE 'trade_pc:%'
          AND length(trim(substring(trim(r->>'direct_key') FROM 10))) > 0
      ),
    '{}'::uuid[]
  )
  INTO v_pc_ids
  FROM jsonb_array_elements(coalesce(v_lite->'rooms', '[]'::jsonb)) AS r;

  v_hs5 := public.home_sync_hs5_unread_legacy_bundle(v_cm_ids, v_pc_ids);

  IF v_tier = 'critical' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'tier', 'critical',
      'rooms', coalesce(v_lite->'rooms', '[]'::jsonb),
      'unread_snapshot', jsonb_build_object(
        'hs5', v_hs5,
        'participants', coalesce(v_lite->'participants', '[]'::jsonb)
      ),
      'room_summaries', '[]'::jsonb,
      'latest_messages', coalesce((
        SELECT jsonb_agg(
          jsonb_build_object(
            'room_id', r->>'id',
            'last_message', r->>'last_message',
            'last_message_at', r->>'last_message_at',
            'last_message_type', r->>'last_message_type'
          )
          ORDER BY r->>'last_message_at' DESC NULLS LAST
        )
        FROM jsonb_array_elements(coalesce(v_lite->'rooms', '[]'::jsonb)) AS r
      ), '[]'::jsonb),
      'lite_bundle', v_lite,
      'hs5', v_hs5,
      'next_cursor', null,
      'snapshot_version', floor(extract(epoch from now()) * 1000)::bigint,
      'list_limit', v_cap,
      'updated_at', now()
    );
  END IF;

  SELECT public.home_sync_direct_keys_critical_bundle(v_cm_ids, v_pc_ids)
  INTO v_trade_context;

  RETURN (
    WITH social AS (
      SELECT jsonb_build_object(
        'accepted_friends', coalesce((
          SELECT jsonb_agg(to_jsonb(fr))
          FROM public.community_friend_requests fr
          WHERE fr.status = 'accepted'
            AND (fr.requester_id = p_user_id OR fr.addressee_id = p_user_id)
        ), '[]'::jsonb),
        'favorite_friend_ids', coalesce((
          SELECT jsonb_agg(ff.target_user_id ORDER BY ff.created_at DESC)
          FROM public.community_friend_favorites ff
          WHERE ff.user_id = p_user_id
        ), '[]'::jsonb),
        'following_neighbor', coalesce((
          SELECT jsonb_agg(ur.target_user_id)
          FROM public.user_relationships ur
          WHERE ur.user_id = p_user_id
            AND (ur.relation_type = 'neighbor_follow' OR ur.type = 'neighbor_follow')
        ), '[]'::jsonb),
        'following_hidden', coalesce((
          SELECT jsonb_agg(ur.target_user_id)
          FROM public.user_relationships ur
          WHERE ur.user_id = p_user_id
            AND (ur.relation_type = 'hidden' OR ur.type = 'hidden')
        ), '[]'::jsonb),
        'following_blocked', coalesce((
          SELECT jsonb_agg(ur.target_user_id)
          FROM public.user_relationships ur
          WHERE ur.user_id = p_user_id
            AND (ur.relation_type = 'blocked' OR ur.type = 'blocked')
        ), '[]'::jsonb),
        'friend_requests', coalesce((
          SELECT jsonb_agg(to_jsonb(fr) ORDER BY fr.created_at DESC)
          FROM public.community_friend_requests fr
          WHERE fr.status = 'pending'
            AND (fr.requester_id = p_user_id OR fr.addressee_id = p_user_id)
        ), '[]'::jsonb)
      ) AS j
    ),
    discoverable AS (
      SELECT coalesce(
        jsonb_agg(
          to_jsonb(r)
          ORDER BY r.last_message_at DESC NULLS LAST
        ),
        '[]'::jsonb
      ) AS rooms
      FROM public.community_messenger_rooms r
      WHERE r.room_type = 'open_group'
        AND r.is_discoverable = true
      LIMIT 50
    ),
    disc_participants AS (
      SELECT coalesce(
        jsonb_agg(to_jsonb(p)),
        '[]'::jsonb
      ) AS participants
      FROM public.community_messenger_participants p
      WHERE p.room_id IN (
        SELECT (dr->>'id')::uuid
        FROM discoverable d,
          jsonb_array_elements(d.rooms) AS dr
        WHERE dr->>'id' IS NOT NULL
      )
    ),
    joined_rooms AS (
      SELECT coalesce(
        jsonb_agg(p.room_id),
        '[]'::jsonb
      ) AS ids
      FROM public.community_messenger_participants p
      WHERE p.user_id = p_user_id
    ),
    call_logs AS (
      SELECT coalesce(
        jsonb_agg(
          to_jsonb(cl) ||
          jsonb_build_object(
            'sessionEndedAt', cs.ended_at,
            'sessionEndedReason', cs.ended_reason
          )
          ORDER BY cl.started_at DESC NULLS LAST
        ),
        '[]'::jsonb
      ) AS rows
      FROM public.community_messenger_call_logs cl
      LEFT JOIN public.community_messenger_call_sessions cs ON cs.id = cl.session_id
      WHERE cl.caller_user_id = p_user_id OR cl.peer_user_id = p_user_id
      LIMIT 30
    ),
    call_session_participants AS (
      SELECT coalesce(
        jsonb_agg(to_jsonb(csp)),
        '[]'::jsonb
      ) AS rows
      FROM public.community_messenger_call_session_participants csp
      WHERE csp.session_id IN (
        SELECT (cr->>'session_id')::uuid
        FROM call_logs cl,
          jsonb_array_elements(cl.rows) AS cr
        WHERE cr->>'session_id' IS NOT NULL
      )
    ),
    meetings AS (
      SELECT coalesce(
        jsonb_agg(to_jsonb(m)),
        '[]'::jsonb
      ) AS rows
      FROM public.meetings m
      WHERE m.community_messenger_room_id IN (
        SELECT (dr->>'id')::uuid
        FROM discoverable d,
          jsonb_array_elements(d.rooms) AS dr
        WHERE dr->>'id' IS NOT NULL
      )
    ),
    all_user_ids AS (
      SELECT DISTINCT uid AS id
      FROM (
        SELECT p_user_id AS uid
        UNION
        SELECT (pr->>'user_id')::uuid FROM jsonb_array_elements(coalesce(v_lite->'participants', '[]'::jsonb)) AS pr
        UNION
        SELECT (fr->>'requester_id')::uuid FROM social s, jsonb_array_elements(coalesce(s.j->'accepted_friends', '[]'::jsonb)) AS fr
        UNION
        SELECT (fr->>'addressee_id')::uuid FROM social s, jsonb_array_elements(coalesce(s.j->'accepted_friends', '[]'::jsonb)) AS fr
        UNION
        SELECT (fr->>'requester_id')::uuid FROM social s, jsonb_array_elements(coalesce(s.j->'friend_requests', '[]'::jsonb)) AS fr
        UNION
        SELECT (fr->>'addressee_id')::uuid FROM social s, jsonb_array_elements(coalesce(s.j->'friend_requests', '[]'::jsonb)) AS fr
        UNION
        SELECT (fid)::uuid FROM social s, jsonb_array_elements_text(coalesce(s.j->'favorite_friend_ids', '[]'::jsonb)) AS fid
        UNION
        SELECT (fid)::uuid FROM social s, jsonb_array_elements_text(coalesce(s.j->'following_neighbor', '[]'::jsonb)) AS fid
        UNION
        SELECT (fid)::uuid FROM social s, jsonb_array_elements_text(coalesce(s.j->'following_hidden', '[]'::jsonb)) AS fid
        UNION
        SELECT (fid)::uuid FROM social s, jsonb_array_elements_text(coalesce(s.j->'following_blocked', '[]'::jsonb)) AS fid
        UNION
        SELECT (dp->>'user_id')::uuid FROM disc_participants dpj, jsonb_array_elements(dpj.participants) AS dp
        UNION
        SELECT (cl->>'caller_user_id')::uuid FROM call_logs clj, jsonb_array_elements(clj.rows) AS cl
        UNION
        SELECT (cl->>'peer_user_id')::uuid FROM call_logs clj, jsonb_array_elements(clj.rows) AS cl
        UNION
        SELECT (csp->>'user_id')::uuid FROM call_session_participants cspj, jsonb_array_elements(cspj.rows) AS csp
      ) z
      WHERE uid IS NOT NULL
    ),
    profile_labels_expanded AS (
      SELECT coalesce(
        jsonb_object_agg(
          pr.id::text,
          jsonb_build_object(
            'id', pr.id,
            'display_name', pr.display_name,
            'nickname', pr.nickname,
            'username', pr.username,
            'avatar_url', pr.avatar_url,
            'bio', pr.bio
          )
        ),
        coalesce(v_lite->'profile_labels', '{}'::jsonb)
      ) AS profiles
      FROM public.profiles pr
      WHERE pr.id IN (SELECT id FROM all_user_ids)
    )
    SELECT jsonb_build_object(
      'ok', true,
      'tier', 'full',
      'rooms', coalesce(v_lite->'rooms', '[]'::jsonb),
      'unread_snapshot', jsonb_build_object(
        'hs5', v_hs5,
        'participants', coalesce(v_lite->'participants', '[]'::jsonb)
      ),
      'room_summaries', '[]'::jsonb,
      'latest_messages', coalesce((
        SELECT jsonb_agg(
          jsonb_build_object(
            'room_id', r->>'id',
            'last_message', r->>'last_message',
            'last_message_at', r->>'last_message_at',
            'last_message_type', r->>'last_message_type'
          )
          ORDER BY r->>'last_message_at' DESC NULLS LAST
        )
        FROM jsonb_array_elements(coalesce(v_lite->'rooms', '[]'::jsonb)) AS r
      ), '[]'::jsonb),
      'lite_bundle', v_lite,
      'hs5', v_hs5,
      'social_graph', (SELECT j FROM social),
      'discoverable', jsonb_build_object(
        'rooms', (SELECT rooms FROM discoverable),
        'participants', (SELECT participants FROM disc_participants),
        'joined_room_ids', (SELECT ids FROM joined_rooms)
      ),
      'trade_context', coalesce(v_trade_context, '{}'::jsonb),
      'order_context', '{}'::jsonb,
      'notification_context', '{}'::jsonb,
      'attachment_meta', '{}'::jsonb,
      'call_logs', (SELECT rows FROM call_logs),
      'call_session_participants', (SELECT rows FROM call_session_participants),
      'meetings', (SELECT rows FROM meetings),
      'profile_labels_expanded', (SELECT profiles FROM profile_labels_expanded),
      'next_cursor', null,
      'snapshot_version', floor(extract(epoch from now()) * 1000)::bigint,
      'list_limit', v_cap,
      'updated_at', now()
    )
  );
END;
$$;

COMMENT ON FUNCTION public.get_cm_bootstrap_full_snapshot(uuid, text, integer, text) IS
  'FBT1 CM bootstrap — tier-aware full/critical snapshot in one RPC RTT.';

REVOKE ALL ON FUNCTION public.get_cm_bootstrap_full_snapshot(uuid, text, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_cm_bootstrap_full_snapshot(uuid, text, integer, text) FROM anon;
REVOKE ALL ON FUNCTION public.get_cm_bootstrap_full_snapshot(uuid, text, integer, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_cm_bootstrap_full_snapshot(uuid, text, integer, text) TO service_role;
