-- §2 묶음 6 — 상호 친구 요청 (pending → accept 원자 트랜잭션)
-- community_friend_requests 재활성 · user_social_relations 양쪽 friend 행
-- 기존 Contact 행 백필 없음 · 거래/주문/배달 비영향
-- 운영 적용은 Owner 별도 승인 후

COMMENT ON TABLE public.community_friend_requests IS
  'CM mutual friend requests (pending/accepted/rejected/cancelled). Accept creates both user_social_relations.friend rows atomically via cm_accept_friend_request.';

CREATE OR REPLACE FUNCTION public.cm_send_friend_request(
  p_requester_id uuid,
  p_addressee_id uuid,
  p_note text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing public.community_friend_requests%ROWTYPE;
  v_blocked boolean;
  v_friend_ab boolean;
  v_friend_ba boolean;
BEGIN
  IF p_requester_id IS NULL OR p_addressee_id IS NULL OR p_requester_id = p_addressee_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'bad_target');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_social_relations r
    WHERE r.relation_type = 'blocked' AND r.is_active IS TRUE
      AND (
        (r.owner_user_id = p_requester_id AND r.target_user_id = p_addressee_id)
        OR (r.owner_user_id = p_addressee_id AND r.target_user_id = p_requester_id)
      )
  ) INTO v_blocked;
  IF v_blocked THEN
    RETURN jsonb_build_object('ok', false, 'error', 'blocked_target');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_social_relations r
    WHERE r.owner_user_id = p_requester_id AND r.target_user_id = p_addressee_id
      AND r.relation_type = 'friend'
  ) INTO v_friend_ab;
  SELECT EXISTS (
    SELECT 1 FROM public.user_social_relations r
    WHERE r.owner_user_id = p_addressee_id AND r.target_user_id = p_requester_id
      AND r.relation_type = 'friend'
  ) INTO v_friend_ba;
  IF v_friend_ab AND v_friend_ba THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_friend');
  END IF;

  SELECT * INTO v_existing
  FROM public.community_friend_requests
  WHERE requester_id = p_requester_id AND addressee_id = p_addressee_id;

  IF FOUND THEN
    IF v_existing.status = 'pending' THEN
      RETURN jsonb_build_object(
        'ok', true,
        'request_id', v_existing.id,
        'status', 'pending',
        'already_requested', true
      );
    END IF;
    IF v_existing.status = 'accepted' AND v_friend_ab AND v_friend_ba THEN
      RETURN jsonb_build_object('ok', false, 'error', 'already_friend');
    END IF;
    -- rejected/cancelled/blocked → reopen as pending (no backfill of other rows)
    UPDATE public.community_friend_requests
    SET status = 'pending',
        note = coalesce(nullif(trim(p_note), ''), note),
        responded_at = NULL,
        created_at = now()
    WHERE id = v_existing.id
    RETURNING * INTO v_existing;
    RETURN jsonb_build_object(
      'ok', true,
      'request_id', v_existing.id,
      'status', 'pending'
    );
  END IF;

  -- Incoming reverse pending: tell client to accept instead of dual pending
  SELECT * INTO v_existing
  FROM public.community_friend_requests
  WHERE requester_id = p_addressee_id AND addressee_id = p_requester_id AND status = 'pending';
  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'incoming_request_exists',
      'request_id', v_existing.id
    );
  END IF;

  INSERT INTO public.community_friend_requests (requester_id, addressee_id, status, note)
  VALUES (p_requester_id, p_addressee_id, 'pending', coalesce(p_note, ''))
  RETURNING * INTO v_existing;

  RETURN jsonb_build_object(
    'ok', true,
    'request_id', v_existing.id,
    'status', 'pending'
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', 'friend_request_send_failed', 'detail', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION public.cm_accept_friend_request(
  p_request_id uuid,
  p_actor_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req public.community_friend_requests%ROWTYPE;
  v_now timestamptz := now();
BEGIN
  IF p_request_id IS NULL OR p_actor_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'bad_request');
  END IF;

  SELECT * INTO v_req
  FROM public.community_friend_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'request_not_found');
  END IF;

  IF v_req.addressee_id <> p_actor_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF v_req.status = 'accepted' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'request_id', v_req.id,
      'status', 'accepted',
      'idempotent', true,
      'peer_user_id', v_req.requester_id
    );
  END IF;

  IF v_req.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_pending');
  END IF;

  -- Both friend rows (viewer-local Contact SSOT) inside this function = one txn
  INSERT INTO public.user_social_relations (owner_user_id, target_user_id, relation_type, is_active, created_at, last_action_at, updated_at)
  VALUES (v_req.requester_id, v_req.addressee_id, 'friend', true, v_now, v_now, v_now)
  ON CONFLICT (owner_user_id, target_user_id) DO UPDATE
    SET relation_type = 'friend',
        is_active = true,
        last_action_at = excluded.last_action_at,
        updated_at = excluded.updated_at
    WHERE public.user_social_relations.relation_type IS DISTINCT FROM 'friend'
       OR public.user_social_relations.is_active IS DISTINCT FROM true;

  INSERT INTO public.user_social_relations (owner_user_id, target_user_id, relation_type, is_active, created_at, last_action_at, updated_at)
  VALUES (v_req.addressee_id, v_req.requester_id, 'friend', true, v_now, v_now, v_now)
  ON CONFLICT (owner_user_id, target_user_id) DO UPDATE
    SET relation_type = 'friend',
        is_active = true,
        last_action_at = excluded.last_action_at,
        updated_at = excluded.updated_at
    WHERE public.user_social_relations.relation_type IS DISTINCT FROM 'friend'
       OR public.user_social_relations.is_active IS DISTINCT FROM true;

  UPDATE public.community_friend_requests
  SET status = 'accepted', responded_at = v_now
  WHERE id = v_req.id;

  RETURN jsonb_build_object(
    'ok', true,
    'request_id', v_req.id,
    'status', 'accepted',
    'peer_user_id', v_req.requester_id
  );
EXCEPTION
  WHEN OTHERS THEN
    -- plpgsql function body is atomic; raise to roll back both friend upserts + status
    RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION public.cm_reject_friend_request(
  p_request_id uuid,
  p_actor_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req public.community_friend_requests%ROWTYPE;
BEGIN
  IF p_request_id IS NULL OR p_actor_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'bad_request');
  END IF;

  SELECT * INTO v_req
  FROM public.community_friend_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'request_not_found');
  END IF;

  IF v_req.addressee_id <> p_actor_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF v_req.status = 'rejected' THEN
    RETURN jsonb_build_object('ok', true, 'request_id', v_req.id, 'status', 'rejected', 'idempotent', true);
  END IF;

  IF v_req.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_pending');
  END IF;

  UPDATE public.community_friend_requests
  SET status = 'rejected', responded_at = now()
  WHERE id = v_req.id;

  RETURN jsonb_build_object('ok', true, 'request_id', v_req.id, 'status', 'rejected');
END;
$$;

CREATE OR REPLACE FUNCTION public.cm_cancel_friend_request(
  p_requester_id uuid,
  p_addressee_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req public.community_friend_requests%ROWTYPE;
BEGIN
  IF p_requester_id IS NULL OR p_addressee_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'bad_target');
  END IF;

  SELECT * INTO v_req
  FROM public.community_friend_requests
  WHERE requester_id = p_requester_id AND addressee_id = p_addressee_id AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'did_cancel', false);
  END IF;

  UPDATE public.community_friend_requests
  SET status = 'cancelled', responded_at = now()
  WHERE id = v_req.id;

  RETURN jsonb_build_object('ok', true, 'did_cancel', true, 'request_id', v_req.id);
END;
$$;

-- Supabase default privileges grant EXECUTE to anon/authenticated on new functions;
-- PUBLIC revoke alone is not enough — revoke named API roles explicitly.
REVOKE ALL ON FUNCTION public.cm_send_friend_request(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cm_accept_friend_request(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cm_reject_friend_request(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cm_cancel_friend_request(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cm_send_friend_request(uuid, uuid, text) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.cm_accept_friend_request(uuid, uuid) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.cm_reject_friend_request(uuid, uuid) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.cm_cancel_friend_request(uuid, uuid) FROM anon, authenticated;

GRANT EXECUTE ON FUNCTION public.cm_send_friend_request(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.cm_accept_friend_request(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.cm_reject_friend_request(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.cm_cancel_friend_request(uuid, uuid) TO service_role;
