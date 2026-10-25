-- 1단계 문서 §17-6 A-1(F-12) (Owner 2026-10-26 승인): 친구 DB 함수 보완 — 운영 DB 읽기 전용 조회로 확정한 결함 3건만.
-- ① user_social_relations: anon·authenticated 의 INSERT·UPDATE·DELETE·TRUNCATE 회수(API 없이 친구 행 생성·차단 삭제 차단).
--    앱의 쓰기는 모두 서버(service role). SELECT 는 유지(Realtime 구독이 RLS 로 본인 행만 받음).
-- ② cm_accept_friend_request: 두 사람 사이 활성 차단이 있으면 'blocked_target' (차단 행이 친구 행으로 덮이는 것 방지).
-- ③ cm_send_friend_request: 두 사람 쌍 advisory 잠금(연타 → 이미 요청함, 양방향 동시 → 받은 요청 있음).
-- 그 밖의 본문은 운영 정의와 동일(운영 정의 = 20270625120000 의 accept, 20270626120000 의 send — 2026-10-26 조회로 일치 확인).
-- 롤백: GRANT INSERT, UPDATE, DELETE, TRUNCATE ON public.user_social_relations TO anon, authenticated;
--       + 20270625120000_cm_mutual_friend_request_atomic.sql 의 cm_accept_friend_request 정의
--       + 20270626120000_cm_send_friend_request_block_rejected_resend.sql 의 cm_send_friend_request 정의 재적용.

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.user_social_relations FROM anon, authenticated;

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

  -- §17-6 ②: 두 사람 사이 활성 차단(어느 쪽이든)이 있으면 수락하지 않는다.
  -- 아래 ON CONFLICT 가 같은 쌍의 차단 행을 친구 행으로 덮어써 차단이 사라지는 것을 막는다.
  IF EXISTS (
    SELECT 1 FROM public.user_social_relations r
    WHERE r.relation_type = 'blocked' AND r.is_active IS TRUE
      AND (
        (r.owner_user_id = v_req.requester_id AND r.target_user_id = v_req.addressee_id)
        OR (r.owner_user_id = v_req.addressee_id AND r.target_user_id = v_req.requester_id)
      )
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'blocked_target');
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

CREATE OR REPLACE FUNCTION public.cm_send_friend_request(p_requester_id uuid, p_addressee_id uuid, p_note text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_existing public.community_friend_requests%ROWTYPE;
  v_blocked boolean;
  v_friend_ab boolean;
  v_friend_ba boolean;
BEGIN
  IF p_requester_id IS NULL OR p_addressee_id IS NULL OR p_requester_id = p_addressee_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'bad_target');
  END IF;

  -- §17-6 ③: 같은 두 사람의 요청을 줄 세운다(연타·양방향 동시 요청). 트랜잭션 끝에 자동 해제.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      least(p_requester_id::text, p_addressee_id::text) || ':' || greatest(p_requester_id::text, p_addressee_id::text),
      0
    )
  );

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
    -- §14-5: 거절된 요청은 되살리지 않는다(거절한 사람이 해제 → cancelled 가 된 뒤에만 다시 요청 가능)
    IF v_existing.status = 'rejected' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'request_rejected', 'request_id', v_existing.id);
    END IF;
    -- cancelled/blocked → reopen as pending (no backfill of other rows)
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
$function$;

REVOKE ALL ON FUNCTION public.cm_accept_friend_request(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cm_accept_friend_request(uuid, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cm_accept_friend_request(uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.cm_send_friend_request(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cm_send_friend_request(uuid, uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cm_send_friend_request(uuid, uuid, text) TO service_role;
