-- Block SSOT is_active parity — 해제된 차단(user_social_relations.is_active=false)을 차단으로 보지 않는다.
-- 앱 SSOT: lib/social/block-ssot-types.ts isActiveSocialBlockRow (is_active !== false; NULL = legacy active).
-- 최신 정의를 그대로 복사하고 차단 predicate 한 줄만 변경:
--   * public.gift_certificate_offer           ← 20270118120000_gift_certificate_offer_peer_uuid_min_fix.sql
--   * public.get_cm_bootstrap_full_snapshot   ← 20270414210000 (hides 테이블 존재 시) / 20261118140000 (운영 현행 본문)
--     (blocked_union 의 user_social_relations 분기 — 해제된 사용자가 차단 목록에 남던 문제)
-- 그 외 본문·권한 변경 없음.

CREATE OR REPLACE FUNCTION public.gift_certificate_offer(
  p_sender_user_id uuid,
  p_instance_id uuid,
  p_recipient_user_id uuid,
  p_room_id uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  v_inst public.gift_certificate_instances%ROWTYPE;
  v_room public.community_messenger_rooms%ROWTYPE;
  v_transferable boolean;
  v_transfer_id uuid;
  v_existing_id uuid;
  v_message_id uuid;
  v_product_title text;
  v_product_image_url text;
  v_store_name text;
  v_metadata jsonb;
  v_created_at timestamptz := now();
  v_preview text := 'Gift certificate';
  v_validated_room_id uuid;
  v_validated_peer_user_id uuid;
  v_peer_count integer;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_sender_user_id IS NULL OR p_instance_id IS NULL OR p_recipient_user_id IS NULL OR v_key IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_args');
  END IF;
  IF p_room_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'room_id_required');
  END IF;
  IF p_sender_user_id = p_recipient_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cannot_gift_self');
  END IF;

  SELECT t.id INTO v_existing_id
    FROM public.gift_certificate_transfers t
   WHERE t.idempotency_key = v_key
   LIMIT 1;
  IF FOUND THEN
    RETURN public.gift_transfer_build_mutation_response(v_existing_id, true);
  END IF;

  -- 1–5: resolve room + GENERAL direct + sender participant + exact peer bind
  -- (before any gift asset lock / transfer / message mutation)
  SELECT * INTO v_room
    FROM public.community_messenger_rooms r
   WHERE r.id = p_room_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'room_not_found');
  END IF;

  IF coalesce(v_room.room_type, '') IS DISTINCT FROM 'direct'
     OR coalesce(v_room.chat_domain, '') IS DISTINCT FROM 'general_direct' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_general_direct');
  END IF;

  v_validated_room_id := v_room.id;

  IF NOT EXISTS (
    SELECT 1
      FROM public.community_messenger_participants p
     WHERE p.room_id = v_validated_room_id
       AND p.user_id = p_sender_user_id
       AND p.left_at IS NULL
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_room_participant');
  END IF;

  -- PG: min(uuid) is unavailable on linked Postgres — pick peer without uuid aggregate.
  SELECT count(*)::integer
    INTO v_peer_count
    FROM public.community_messenger_participants p
   WHERE p.room_id = v_validated_room_id
     AND p.user_id IS DISTINCT FROM p_sender_user_id
     AND p.left_at IS NULL;

  SELECT p.user_id
    INTO v_validated_peer_user_id
    FROM public.community_messenger_participants p
   WHERE p.room_id = v_validated_room_id
     AND p.user_id IS DISTINCT FROM p_sender_user_id
     AND p.left_at IS NULL
   ORDER BY p.user_id::text
   LIMIT 1;

  IF v_peer_count IS DISTINCT FROM 1 OR v_validated_peer_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_direct_room');
  END IF;

  IF p_recipient_user_id IS DISTINCT FROM v_validated_peer_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_room_peer');
  END IF;

  -- 6: friendship / block (validated peer only)
  IF NOT EXISTS (
    SELECT 1 FROM public.user_social_relations r
     WHERE r.owner_user_id = p_sender_user_id
       AND r.target_user_id = v_validated_peer_user_id
       AND r.relation_type = 'friend'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_friend');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.user_social_relations r
     WHERE (
       (r.owner_user_id = p_sender_user_id AND r.target_user_id = v_validated_peer_user_id)
       OR (r.owner_user_id = v_validated_peer_user_id AND r.target_user_id = p_sender_user_id)
     )
       AND r.relation_type = 'blocked' AND coalesce(r.is_active, true)
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'blocked');
  END IF;

  -- 7: gift ownership / status / transferable (after room-peer bind)
  SELECT * INTO v_inst
    FROM public.gift_certificate_instances
   WHERE id = p_instance_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'instance_not_found');
  END IF;
  IF public.gift_certificate_instance_is_expired(v_inst.valid_until) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'gift_expired');
  END IF;
  IF v_inst.current_owner_user_id IS DISTINCT FROM p_sender_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_owner');
  END IF;
  IF v_inst.status IS DISTINCT FROM 'ACTIVE' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_status');
  END IF;
  IF coalesce(v_inst.remaining_balance, 0) <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'zero_balance');
  END IF;

  SELECT coalesce(p.transferable, true) INTO v_transferable
    FROM public.gift_certificate_products p
   WHERE p.id = v_inst.product_id;
  IF NOT coalesce(v_transferable, false) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_transferable');
  END IF;

  -- 8: PENDING transfer + message projection (validated room + peer only)
  INSERT INTO public.gift_certificate_transfers (
    instance_id, sender_user_id, recipient_user_id, room_id, status, idempotency_key
  ) VALUES (
    p_instance_id, p_sender_user_id, v_validated_peer_user_id, v_validated_room_id, 'PENDING', v_key
  )
  RETURNING id INTO v_transfer_id;

  UPDATE public.gift_certificate_instances
     SET status = 'GIFT_LOCKED',
         version = version + 1
   WHERE id = p_instance_id;

  INSERT INTO public.gift_certificate_ledger (
    instance_id, store_id, user_id, entry_type, amount,
    related_type, related_id, description, actor_type
  ) VALUES (
    p_instance_id,
    v_inst.store_id,
    p_sender_user_id,
    'GIFT_OFFER',
    0,
    'gift_certificate_transfer',
    v_transfer_id::text,
    'Gift offer pending',
    'user'
  );

  SELECT
    coalesce(pr.title, ''),
    pr.image_url,
    coalesce(st.store_name, '')
    INTO v_product_title, v_product_image_url, v_store_name
    FROM public.gift_certificate_products pr
    LEFT JOIN public.stores st ON st.id = pr.store_id
   WHERE pr.id = v_inst.product_id;

  v_metadata := jsonb_build_object(
    'gift_transfer_id', v_transfer_id,
    'instance_id', p_instance_id,
    'store_id', v_inst.store_id,
    'store_name', nullif(btrim(v_store_name), ''),
    'title', nullif(btrim(v_product_title), ''),
    'image_url', v_product_image_url,
    'face_value', v_inst.face_value,
    'remaining_balance', v_inst.remaining_balance,
    'public_gift_number', nullif(btrim(coalesce(v_inst.public_gift_number, '')), ''),
    'transfer_status', 'PENDING'
  );

  INSERT INTO public.community_messenger_messages (
    room_id, sender_id, message_type, content, metadata, created_at
  ) VALUES (
    v_validated_room_id, p_sender_user_id, 'gift_certificate', v_preview, v_metadata, v_created_at
  )
  RETURNING id INTO v_message_id;

  UPDATE public.gift_certificate_transfers
     SET messenger_message_id = v_message_id
   WHERE id = v_transfer_id;

  UPDATE public.community_messenger_rooms
     SET last_message = v_preview,
         last_message_at = v_created_at,
         last_message_type = 'gift_certificate',
         updated_at = v_created_at
   WHERE id = v_validated_room_id;

  PERFORM public.community_messenger_apply_unread_for_text_message(
    v_validated_room_id,
    p_sender_user_id,
    v_created_at
  );

  RETURN public.gift_transfer_build_mutation_response(v_transfer_id, false);
EXCEPTION
  WHEN unique_violation THEN
    SELECT t.id INTO v_existing_id
      FROM public.gift_certificate_transfers t
     WHERE t.idempotency_key = v_key
     LIMIT 1;
    IF FOUND THEN
      RETURN public.gift_transfer_build_mutation_response(v_existing_id, true);
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'pending_transfer_exists');
END;
$$;

REVOKE ALL ON FUNCTION public.gift_certificate_offer(uuid, uuid, uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.gift_certificate_offer(uuid, uuid, uuid, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.gift_certificate_offer(uuid, uuid, uuid, uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.gift_certificate_offer(uuid, uuid, uuid, uuid, text) TO service_role;

-- 운영 DB 정합: 운영의 get_cm_bootstrap_full_snapshot 본문은 20261118140000 버전이며,
-- 20270414200000(call_log_user_hides 테이블)·20270414210000 이 아직 적용되지 않았다(2026-10-15 확인).
-- 최신 저장소 본문은 없는 테이블을 참조해 런타임 오류가 나므로, 테이블 존재 여부로 기준 본문을 고른다.
-- 두 분기 모두 기준 본문과 비교해 차단 predicate 한 줄(`AND coalesce(sr.is_active, true)`)만 다르다.
DO $mig$
BEGIN
  IF to_regclass('public.community_messenger_call_log_user_hides') IS NOT NULL THEN
    EXECUTE $fn_hides$
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
  v_order_context jsonb;
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

  SELECT jsonb_build_object(
    'store_orders', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', so.id,
          'order_status', so.order_status,
          'community_messenger_room_id', so.community_messenger_room_id,
          'store_id', so.store_id,
          'store_name', st.store_name,
          'profile_image_url', st.profile_image_url
        )
      )
      FROM public.store_orders so
      LEFT JOIN public.stores st ON st.id = so.store_id
      WHERE (
        so.id IN (
          SELECT DISTINCT (nullif(trim(substring(trim(r->>'direct_key') FROM 13)), ''))::uuid
          FROM jsonb_array_elements(coalesce(v_lite->'rooms', '[]'::jsonb)) AS r
          WHERE coalesce(r->>'room_type', '') = 'direct'
            AND (
              trim(coalesce(r->>'direct_key', '')) LIKE 'store_order:%'
              OR trim(coalesce(r->>'direct_key', '')) LIKE 'trade_order:%'
            )
            AND length(trim(substring(trim(r->>'direct_key') FROM 13))) = 36
        )
      )
      OR (
        so.community_messenger_room_id IN (
          SELECT DISTINCT (r->>'id')::uuid
          FROM jsonb_array_elements(coalesce(v_lite->'rooms', '[]'::jsonb)) AS r
          WHERE coalesce(r->>'room_type', '') = 'direct'
            AND (
              trim(coalesce(r->>'direct_key', '')) LIKE 'store_order:%'
              OR trim(coalesce(r->>'direct_key', '')) LIKE 'trade_order:%'
            )
            AND (r->>'id') IS NOT NULL
        )
      )
    ), '[]'::jsonb)
  )
  INTO v_order_context;

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
      'order_context', coalesce(v_order_context, jsonb_build_object('store_orders', '[]'::jsonb)),
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
          SELECT jsonb_agg(
            jsonb_build_object(
              'requester_id', f.requester_user_id,
              'addressee_id', f.addressee_user_id,
              'status', 'accepted',
              'created_at', f.created_at,
              'responded_at', coalesce(f.accepted_at, f.updated_at)
            )
            ORDER BY coalesce(f.accepted_at, f.updated_at) DESC NULLS LAST
          )
          FROM public.community_messenger_friendships f
          WHERE f.status = 'accepted'
            AND (f.requester_user_id = p_user_id OR f.addressee_user_id = p_user_id)
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
          SELECT jsonb_agg(DISTINCT blocked_id)
          FROM (
            SELECT CASE
              WHEN f.blocked_by_user_id = p_user_id THEN
                CASE WHEN f.requester_user_id = p_user_id THEN f.addressee_user_id ELSE f.requester_user_id END
              WHEN f.requester_user_id = p_user_id AND f.addressee_user_id <> p_user_id THEN f.addressee_user_id
              WHEN f.addressee_user_id = p_user_id AND f.requester_user_id <> p_user_id THEN f.requester_user_id
            END AS blocked_id
            FROM public.community_messenger_friendships f
            WHERE f.status = 'blocked'
              AND (f.requester_user_id = p_user_id OR f.addressee_user_id = p_user_id)
            UNION
            SELECT sr.target_user_id AS blocked_id
            FROM public.user_social_relations sr
            WHERE sr.owner_user_id = p_user_id
              AND sr.relation_type = 'blocked' AND coalesce(sr.is_active, true)
            UNION
            SELECT ur.target_user_id AS blocked_id
            FROM public.user_relationships ur
            WHERE ur.user_id = p_user_id
              AND (ur.relation_type = 'blocked' OR ur.type = 'blocked')
          ) blocked_union
          WHERE blocked_id IS NOT NULL
        ), '[]'::jsonb),
        'friend_requests', coalesce((
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', f.id,
              'requester_id', f.requester_user_id,
              'addressee_id', f.addressee_user_id,
              'status', f.status,
              'created_at', f.created_at,
              'responded_at', null
            )
            ORDER BY f.created_at DESC
          )
          FROM public.community_messenger_friendships f
          WHERE f.status = 'pending'
            AND (f.requester_user_id = p_user_id OR f.addressee_user_id = p_user_id)
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
      WHERE (cl.caller_user_id = p_user_id OR cl.peer_user_id = p_user_id)
        -- WP-8 NEW-08 (LOCK-04): DELETE_FOR_ME 로 이 사용자가 숨긴 call_log 는 부트스트랩에도 제외.
        AND NOT EXISTS (
          SELECT 1 FROM public.community_messenger_call_log_user_hides h
          WHERE h.user_id = p_user_id AND h.call_log_id = cl.id
        )
      LIMIT 100
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
      'order_context', coalesce(v_order_context, jsonb_build_object('store_orders', '[]'::jsonb)),
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
$fn_hides$;
  ELSE
    EXECUTE $fn_base$
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
  v_order_context jsonb;
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

  SELECT jsonb_build_object(
    'store_orders', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', so.id,
          'order_status', so.order_status,
          'community_messenger_room_id', so.community_messenger_room_id,
          'store_id', so.store_id,
          'store_name', st.store_name,
          'profile_image_url', st.profile_image_url
        )
      )
      FROM public.store_orders so
      LEFT JOIN public.stores st ON st.id = so.store_id
      WHERE (
        so.id IN (
          SELECT DISTINCT (nullif(trim(substring(trim(r->>'direct_key') FROM 13)), ''))::uuid
          FROM jsonb_array_elements(coalesce(v_lite->'rooms', '[]'::jsonb)) AS r
          WHERE coalesce(r->>'room_type', '') = 'direct'
            AND (
              trim(coalesce(r->>'direct_key', '')) LIKE 'store_order:%'
              OR trim(coalesce(r->>'direct_key', '')) LIKE 'trade_order:%'
            )
            AND length(trim(substring(trim(r->>'direct_key') FROM 13))) = 36
        )
      )
      OR (
        so.community_messenger_room_id IN (
          SELECT DISTINCT (r->>'id')::uuid
          FROM jsonb_array_elements(coalesce(v_lite->'rooms', '[]'::jsonb)) AS r
          WHERE coalesce(r->>'room_type', '') = 'direct'
            AND (
              trim(coalesce(r->>'direct_key', '')) LIKE 'store_order:%'
              OR trim(coalesce(r->>'direct_key', '')) LIKE 'trade_order:%'
            )
            AND (r->>'id') IS NOT NULL
        )
      )
    ), '[]'::jsonb)
  )
  INTO v_order_context;

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
      'order_context', coalesce(v_order_context, jsonb_build_object('store_orders', '[]'::jsonb)),
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
          SELECT jsonb_agg(
            jsonb_build_object(
              'requester_id', f.requester_user_id,
              'addressee_id', f.addressee_user_id,
              'status', 'accepted',
              'created_at', f.created_at,
              'responded_at', coalesce(f.accepted_at, f.updated_at)
            )
            ORDER BY coalesce(f.accepted_at, f.updated_at) DESC NULLS LAST
          )
          FROM public.community_messenger_friendships f
          WHERE f.status = 'accepted'
            AND (f.requester_user_id = p_user_id OR f.addressee_user_id = p_user_id)
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
          SELECT jsonb_agg(DISTINCT blocked_id)
          FROM (
            SELECT CASE
              WHEN f.blocked_by_user_id = p_user_id THEN
                CASE WHEN f.requester_user_id = p_user_id THEN f.addressee_user_id ELSE f.requester_user_id END
              WHEN f.requester_user_id = p_user_id AND f.addressee_user_id <> p_user_id THEN f.addressee_user_id
              WHEN f.addressee_user_id = p_user_id AND f.requester_user_id <> p_user_id THEN f.requester_user_id
            END AS blocked_id
            FROM public.community_messenger_friendships f
            WHERE f.status = 'blocked'
              AND (f.requester_user_id = p_user_id OR f.addressee_user_id = p_user_id)
            UNION
            SELECT sr.target_user_id AS blocked_id
            FROM public.user_social_relations sr
            WHERE sr.owner_user_id = p_user_id
              AND sr.relation_type = 'blocked' AND coalesce(sr.is_active, true)
            UNION
            SELECT ur.target_user_id AS blocked_id
            FROM public.user_relationships ur
            WHERE ur.user_id = p_user_id
              AND (ur.relation_type = 'blocked' OR ur.type = 'blocked')
          ) blocked_union
          WHERE blocked_id IS NOT NULL
        ), '[]'::jsonb),
        'friend_requests', coalesce((
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', f.id,
              'requester_id', f.requester_user_id,
              'addressee_id', f.addressee_user_id,
              'status', f.status,
              'created_at', f.created_at,
              'responded_at', null
            )
            ORDER BY f.created_at DESC
          )
          FROM public.community_messenger_friendships f
          WHERE f.status = 'pending'
            AND (f.requester_user_id = p_user_id OR f.addressee_user_id = p_user_id)
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
      LIMIT 100
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
      'order_context', coalesce(v_order_context, jsonb_build_object('store_orders', '[]'::jsonb)),
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
$fn_base$;
  END IF;
END
$mig$;

COMMENT ON FUNCTION public.get_cm_bootstrap_full_snapshot(uuid, text, integer, text) IS
  'FBT1 CM bootstrap — friendships SSOT; order_context.store_orders include store_name for list first paint.';

REVOKE ALL ON FUNCTION public.get_cm_bootstrap_full_snapshot(uuid, text, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_cm_bootstrap_full_snapshot(uuid, text, integer, text) FROM anon;
REVOKE ALL ON FUNCTION public.get_cm_bootstrap_full_snapshot(uuid, text, integer, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_cm_bootstrap_full_snapshot(uuid, text, integer, text) TO service_role;
