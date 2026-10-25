-- 1단계 문서 §14-5 (Owner 2026-10-25 승인, 텔레그램 기준):
-- 상대가 내 친구 요청을 거절(rejected)하면 거절한 사람이 해제하기 전에는 다시 요청할 수 없다.
-- 이전 정의(운영 DB 2026-10-25 19:30 PHT 조회 원문)는 rejected/cancelled/blocked 를 모두 pending 으로 되살렸다.
-- 변경: rejected 만 'request_rejected' 로 거부. cancelled(요청 취소·친구 삭제·거절 해제) 는 기존처럼 다시 요청 가능.
-- 나머지 본문은 운영 정의와 동일. 서버(service.ts sendCommunityMessengerFriendRequest)도 같은 판정을 먼저 한다.
-- 롤백: 20270625120000_cm_mutual_friend_request_atomic.sql 의 cm_send_friend_request 정의를 다시 적용.

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

REVOKE ALL ON FUNCTION public.cm_send_friend_request(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cm_send_friend_request(uuid, uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cm_send_friend_request(uuid, uuid, text) TO service_role;
