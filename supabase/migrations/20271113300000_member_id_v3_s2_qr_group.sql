-- 회원 아이디 v3 S2 (QR 친구 재감사 Q4·Q5 · 친구 추가 경로 group) — Owner 「운영 DB 적용」 2026-11-12
-- 1) community_friend_requests.source 에 'group' 허용 (그룹 만들기·방 그룹 초대 중 친구 추가)
-- 2) cm_send_friend_request: p_source 'group' 받기 (그 밖 본문 그대로 — 20271111170000 과 같음)
-- 3) cm_add_friend_via_qr: Q5 이미 친구면 scan_count 안 올림 · Q4 QR 주인→스캔한 사람 rejected 행 cancelled
BEGIN;

ALTER TABLE public.community_friend_requests DROP CONSTRAINT IF EXISTS community_friend_requests_source_check;
ALTER TABLE public.community_friend_requests
  ADD CONSTRAINT community_friend_requests_source_check
  CHECK (source IS NULL OR source IN ('id_search', 'qr', 'contacts', 'profile', 'group'));

CREATE OR REPLACE FUNCTION public.cm_send_friend_request(
  p_requester_id uuid,
  p_addressee_id uuid,
  p_note text DEFAULT ''::text,
  p_source text DEFAULT NULL::text
)
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
  -- N1: 허용 값만 기록 (그 밖은 NULL)
  v_source text := CASE WHEN p_source IN ('id_search', 'contacts', 'profile', 'qr', 'group') THEN p_source ELSE NULL END;
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
        created_at = now(),
        source = v_source  -- E3: 다시 연 요청은 이번 경로로 (이전 QR 기록이 남지 않게)
    WHERE id = v_existing.id
    RETURNING * INTO v_existing;
    RETURN jsonb_build_object(
      'ok', true,
      'request_id', v_existing.id,
      'status', 'pending'
    );
  END IF;

  INSERT INTO public.community_friend_requests (requester_id, addressee_id, status, note, source)  -- N1
  VALUES (p_requester_id, p_addressee_id, 'pending', coalesce(p_note, ''), v_source)
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
REVOKE ALL ON FUNCTION public.cm_send_friend_request(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cm_send_friend_request(uuid, uuid, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.cm_add_friend_via_qr(p_viewer uuid, p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_owner uuid;
  v_owner_row public.profiles%ROWTYPE;
  v_now timestamptz := now();
  v_ab boolean;
  v_ba boolean;
BEGIN
  IF p_viewer IS NULL OR p_token IS NULL OR p_token !~ '^[A-Za-z0-9_-]{22}$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'qr_invalid');
  END IF;

  SELECT q.user_id INTO v_owner FROM public.member_friend_qr q WHERE q.token = p_token;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'qr_invalid');
  END IF;
  IF v_owner = p_viewer THEN
    RETURN jsonb_build_object('ok', false, 'error', 'qr_self');
  END IF;

  SELECT * INTO v_owner_row FROM public.profiles WHERE id = v_owner;
  IF NOT FOUND OR v_owner_row.deleted_at IS NOT NULL OR COALESCE(v_owner_row.status, '') = 'deleted' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'qr_invalid');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.member_discovery_settings s
    WHERE s.user_id = v_owner AND s.allow_qr_add = false
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'qr_disabled');
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      least(p_viewer::text, v_owner::text) || ':' || greatest(p_viewer::text, v_owner::text),
      0
    )
  );

  IF EXISTS (
    SELECT 1 FROM public.user_social_relations r
    WHERE r.relation_type = 'blocked' AND r.is_active IS TRUE
      AND (
        (r.owner_user_id = p_viewer AND r.target_user_id = v_owner)
        OR (r.owner_user_id = v_owner AND r.target_user_id = p_viewer)
      )
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'blocked_target');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_social_relations r
    WHERE r.owner_user_id = p_viewer AND r.target_user_id = v_owner
      AND r.relation_type = 'friend' AND r.is_active IS TRUE
  ) INTO v_ab;
  SELECT EXISTS (
    SELECT 1 FROM public.user_social_relations r
    WHERE r.owner_user_id = v_owner AND r.target_user_id = p_viewer
      AND r.relation_type = 'friend' AND r.is_active IS TRUE
  ) INTO v_ba;

  /** Q5: 이미 친구면 스캔 수를 올리지 않는다 (친구가 된 스캔만 센다) */
  IF v_ab AND v_ba THEN
    RETURN jsonb_build_object('ok', true, 'peer_user_id', v_owner, 'status', 'accepted', 'idempotent', true);
  END IF;

  UPDATE public.member_friend_qr SET scan_count = scan_count + 1 WHERE user_id = v_owner;

  INSERT INTO public.user_social_relations (owner_user_id, target_user_id, relation_type, is_active, created_at, last_action_at, updated_at)
  VALUES (p_viewer, v_owner, 'friend', true, v_now, v_now, v_now)
  ON CONFLICT (owner_user_id, target_user_id) DO UPDATE
    SET relation_type = 'friend',
        is_active = true,
        last_action_at = excluded.last_action_at,
        updated_at = excluded.updated_at
    WHERE public.user_social_relations.relation_type IS DISTINCT FROM 'friend'
       OR public.user_social_relations.is_active IS DISTINCT FROM true;

  INSERT INTO public.user_social_relations (owner_user_id, target_user_id, relation_type, is_active, created_at, last_action_at, updated_at)
  VALUES (v_owner, p_viewer, 'friend', true, v_now, v_now, v_now)
  ON CONFLICT (owner_user_id, target_user_id) DO UPDATE
    SET relation_type = 'friend',
        is_active = true,
        last_action_at = excluded.last_action_at,
        updated_at = excluded.updated_at
    WHERE public.user_social_relations.relation_type IS DISTINCT FROM 'friend'
       OR public.user_social_relations.is_active IS DISTINCT FROM true;

  INSERT INTO public.community_friend_requests (requester_id, addressee_id, status, note, responded_at, source)
  VALUES (p_viewer, v_owner, 'accepted', '', v_now, 'qr')
  ON CONFLICT (requester_id, addressee_id) DO UPDATE
    SET status = 'accepted',
        responded_at = excluded.responded_at,
        source = 'qr';

  -- 반대 방향 대기 요청 정리
  UPDATE public.community_friend_requests
  SET status = 'accepted', responded_at = v_now
  WHERE requester_id = v_owner AND addressee_id = p_viewer AND status = 'pending';

  /**
   * Q4 (FR-D3 와 같은 전이): 스캔한 사람이 예전에 QR 주인의 요청을 거절했던 행은 끝난 것 — rejected → cancelled.
   * 남겨 두면 친구가 된 뒤에도 그 거절이 대화·통화를 막을 수 있다 (일반 요청 경로 FR-D3 와 같은 처리).
   */
  UPDATE public.community_friend_requests
  SET status = 'cancelled', responded_at = v_now
  WHERE requester_id = v_owner AND addressee_id = p_viewer AND status = 'rejected';

  RETURN jsonb_build_object('ok', true, 'peer_user_id', v_owner, 'status', 'accepted');
EXCEPTION
  WHEN OTHERS THEN
    RAISE;
END;
$function$;
REVOKE ALL ON FUNCTION public.cm_add_friend_via_qr(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cm_add_friend_via_qr(uuid, text) TO service_role;

COMMIT;
