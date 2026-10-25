-- 1단계 문서 §17-6 (Owner 2026-10-26 승인): cm_send_friend_request 「받은 요청 있음」 확인 순서만 이동.
-- 원인: 예전 요청 행(취소됨)이 있으면 되살리기 분기로 바로 pending → 상대의 대기 요청 확인을 건너뛰어 서로 대기 2건
--       (2026-10-26 01:00 PHT Samsung q→w · iPhone w→q 시험).
-- 변경: 받은 대기 요청 확인을 내 기존 행 조회보다 먼저. 그 밖의 본문은 20270627120000 과 동일.
-- 롤백: 20270627120000_cm_friend_f12_grants_accept_block_send_lock.sql 의 cm_send_friend_request 정의 재적용.

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

  -- Incoming reverse pending: tell client to accept instead of dual pending
  -- §17-6 (2026-10-26 01:00 PHT 실기기 FAIL): 예전 요청 행 되살리기보다 먼저 확인한다 — 이전에는 행이 없을 때만 확인해 서로 대기 2건이 생겼다.
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

REVOKE ALL ON FUNCTION public.cm_send_friend_request(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cm_send_friend_request(uuid, uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cm_send_friend_request(uuid, uuid, text) TO service_role;
