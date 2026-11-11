-- 회원 아이디 v3 재감사 수정 (Owner 「수정안대로 진행」 2026-11-11)
-- 감사: docs/audit/member-id-base-id-audit-design-2026-11-11.md §9
--
-- D1  자동 아이디 모양 판정 단일 함수 dibay_is_system_auto_id() — assign·confirm·admin_set 이 이 함수만 쓴다
-- E7  confirm_dibay_id 허용 조건 = 생성 컬럼 dibay_id_can_change (아이디가 있는 회원)
-- N6  confirm_dibay_id 가 회원 본인 변경 전후를 audit_logs(member_dibay_id_change)에 남긴다 — 앞으로의 변경부터
-- E2  admin_grant_dibay_id_change 대상 = 본인 변경권을 이미 쓴 회원(dibay_id_changed_once = true)만 (설계 §3.4)
-- E3·N1 cm_send_friend_request(p_source) — 친구가 된 경로를 새 요청·다시 연 요청 모두에 기록
--
-- 운영 함수 정의(2026-11-11 조회본: 20271111160000 적용분 · cm_send_friend_request)를 그대로 옮기고 표시한 줄만 바꿨다.
-- 운영 사전 조회 (읽기 전용): changed_once=true AND locked=false 0명 → E7 로 판정이 바뀌는 회원 0명.

BEGIN;

-- ---------------------------------------------------------------------------
-- D1. 시스템 전용 자동 아이디 모양 (TS `DIBAY_AUTO_PATTERNS` 와 같은 목록 — 계약 시험이 대조)
CREATE OR REPLACE FUNCTION public.dibay_is_system_auto_id(p_value text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'pg_catalog'
AS $function$
  SELECT lower(btrim(COALESCE(p_value, ''))) ~ '^([0-9]{5}[a-z]{3}|dibay[0-9]{6,7}|dibay_[a-f0-9]{6})$';
$function$;

REVOKE ALL ON FUNCTION public.dibay_is_system_auto_id(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dibay_is_system_auto_id(text) TO service_role;

-- ---------------------------------------------------------------------------
-- 자동 발급 — v_auto_re 대신 D1 함수 (나머지 20271111160000 그대로)
CREATE OR REPLACE FUNCTION public.assign_auto_dibay_id(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.profiles%ROWTYPE;
  v_candidate text;
  v_word text;
  v_now timestamptz := now();
  v_attempt int := 0;
  v_max_attempts constant int := 48;
BEGIN
  -- Supabase migration/backfill runs as postgres superuser — bypass JWT gate.
  IF session_user NOT IN ('postgres', 'supabase_admin') THEN
    IF (SELECT auth.role()) <> 'service_role' THEN
      IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_user_id THEN
        RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
      END IF;
    END IF;
  END IF;

  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'user_id_required');
  END IF;

  SELECT * INTO v_row FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'profile_missing');
  END IF;

  IF v_row.dibay_id IS NOT NULL AND btrim(v_row.dibay_id) <> '' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'dibay_id', lower(btrim(v_row.dibay_id)),
      'idempotent', true,
      'skipped', NOT (
        COALESCE(v_row.dibay_id_auto_assigned, false)
        AND NOT COALESCE(v_row.dibay_id_changed_once, false)
      )
    );
  END IF;

  IF v_row.username_confirmed = true
     AND v_row.username IS NOT NULL
     AND btrim(v_row.username) <> ''
     AND NOT public.dibay_is_system_auto_id(v_row.username) THEN  -- D1
    RETURN jsonb_build_object('ok', false, 'error', 'skip_user_confirmed');
  END IF;

  IF v_row.dibay_id_initial IS NOT NULL AND btrim(v_row.dibay_id_initial) <> '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'dibay_id_initial_exists');
  END IF;

  LOOP
    v_attempt := v_attempt + 1;
    IF v_attempt > v_max_attempts THEN
      RETURN jsonb_build_object('ok', false, 'error', 'assign_collision_exhausted');
    END IF;

    SELECT w.word INTO v_word
    FROM public.dibay_id_wordlist w
    WHERE w.enabled = true
    ORDER BY random()
    LIMIT 1;
    IF v_word IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'wordlist_empty');
    END IF;

    v_candidate := lpad(floor(random() * 100000)::int::text, 5, '0') || v_word;

    EXIT WHEN NOT EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.dibay_id_key = v_candidate
         OR p.dibay_id_initial_key = v_candidate
         OR lower(btrim(p.username)) = v_candidate
         OR (
           regexp_replace(lower(btrim(p.username)), '[._]', '', 'g') = v_candidate
           AND p.username_confirmed = true
         )
    );
  END LOOP;

  UPDATE public.profiles
  SET
    dibay_id = v_candidate,
    username = v_candidate,
    username_confirmed = true,
    dibay_id_auto_assigned = true,
    dibay_id_initial = v_candidate,
    dibay_id_changed_once = false,
    dibay_id_changed_at = NULL,
    dibay_id_locked = false,
    username_set_at = COALESCE(username_set_at, v_now),
    updated_at = v_now
  WHERE id = p_user_id;

  RETURN jsonb_build_object('ok', true, 'dibay_id', v_candidate);
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'dibay_id_taken');
END;
$function$;

-- ---------------------------------------------------------------------------
-- 회원 1회 변경 — D1 · E7 · N6 (표시한 줄)
CREATE OR REPLACE FUNCTION public.confirm_dibay_id(p_user_id uuid, p_dibay_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_normalized text;
  v_row public.profiles%ROWTYPE;
  v_terms_version text;
  v_privacy_version text;
  v_now timestamptz := now();
  v_candidate_error text;
  v_before text;
BEGIN
  IF (SELECT auth.role()) <> 'service_role' THEN
    IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_user_id THEN
      RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
    END IF;
  END IF;

  SELECT d.version INTO v_terms_version
  FROM public.app_legal_documents d
  WHERE d.kind = 'terms' AND d.locale = 'ko' AND d.status = 'published'
    AND (d.effective_at IS NULL OR d.effective_at <= v_now)
  ORDER BY d.effective_at DESC NULLS LAST, d.published_at DESC NULLS LAST
  LIMIT 1;
  SELECT d.version INTO v_privacy_version
  FROM public.app_legal_documents d
  WHERE d.kind = 'privacy' AND d.locale = 'ko' AND d.status = 'published'
    AND (d.effective_at IS NULL OR d.effective_at <= v_now)
  ORDER BY d.effective_at DESC NULLS LAST, d.published_at DESC NULLS LAST
  LIMIT 1;
  v_terms_version := COALESCE(NULLIF(btrim(v_terms_version), ''), '2026-04-store-review');
  v_privacy_version := COALESCE(NULLIF(btrim(v_privacy_version), ''), '2026-04-store-review');

  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'user_id_required');
  END IF;

  v_normalized := lower(btrim(replace(COALESCE(p_dibay_id, ''), '@', '')));
  IF v_normalized = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'dibay_id_required');
  END IF;
  IF v_normalized !~ '^[a-z0-9](?:[a-z0-9_.]{2,18}[a-z0-9])$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'dibay_id_invalid_format');
  END IF;
  IF v_normalized IN (
    'admin', 'administrator', 'support', 'owner', 'system', 'official',
    'staff', 'root', 'mod', 'help', 'dibay', 'samarket'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'dibay_id_reserved');
  END IF;
  IF public.dibay_is_system_auto_id(v_normalized) THEN  -- D1
    RETURN jsonb_build_object('ok', false, 'error', 'dibay_id_reserved_pattern');
  END IF;

  SELECT * INTO v_row FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'profile_missing');
  END IF;
  v_before := nullif(lower(btrim(COALESCE(v_row.dibay_id, ''))), '');

  -- E7: 아이디가 있는 회원은 생성 컬럼 dibay_id_can_change 하나로 판정 (앱 표시와 같은 식)
  IF v_before IS NOT NULL AND NOT COALESCE(v_row.dibay_id_can_change, false) THEN
    IF v_before = v_normalized THEN
      RETURN jsonb_build_object('ok', true, 'dibay_id', v_before, 'idempotent', true);
    END IF;
    RETURN jsonb_build_object(
      'ok', false,
      'error', CASE WHEN COALESCE(v_row.dibay_id_changed_once, false) THEN 'dibay_id_change_limit' ELSE 'dibay_id_already_locked' END
    );
  END IF;
  IF v_before = v_normalized THEN
    RETURN jsonb_build_object('ok', true, 'dibay_id', v_before, 'idempotent', true);
  END IF;

  IF v_row.terms_accepted_at IS NULL
    OR v_row.privacy_accepted_at IS NULL
    OR v_row.terms_version IS DISTINCT FROM v_terms_version
    OR v_row.privacy_version IS DISTINCT FROM v_privacy_version
  THEN
    RETURN jsonb_build_object('ok', false, 'error', 'terms_required');
  END IF;

  v_candidate_error := public.dibay_id_candidate_error(p_user_id, v_normalized);
  IF v_candidate_error IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', v_candidate_error);
  END IF;

  UPDATE public.profiles
  SET
    dibay_id = v_normalized,
    dibay_id_auto_assigned = false,
    dibay_id_changed_once = true,
    dibay_id_changed_at = v_now,
    dibay_id_locked = true,
    username = v_normalized,
    username_confirmed = true,
    username_set_at = COALESCE(username_set_at, v_now),
    onboarding_status = 'completed',
    onboarding_completed_at = COALESCE(onboarding_completed_at, v_now),
    updated_at = v_now
  WHERE id = p_user_id;

  -- N6: 회원 본인 변경 기록 (어드민 변경 이력의 「전 → 후」)
  INSERT INTO public.audit_logs (actor_type, actor_id, target_type, target_id, action, before_json, after_json)
  VALUES (
    'user',
    p_user_id,
    'member',
    p_user_id::text,
    'member_dibay_id_change',
    jsonb_build_object('dibay_id', v_before),
    jsonb_build_object('before', v_before, 'after', v_normalized, 'via', 'confirm_dibay_id')
  );

  RETURN jsonb_build_object('ok', true, 'dibay_id', v_normalized);
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'dibay_id_similar_taken');
END;
$function$;

-- ---------------------------------------------------------------------------
-- 관리자 아이디 변경 — D1 (나머지 20271111160000 그대로)
CREATE OR REPLACE FUNCTION public.admin_set_dibay_id(
  p_target_user_id uuid,
  p_dibay_id text,
  p_actor_user_id uuid,
  p_reason text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_normalized text;
  v_row public.profiles%ROWTYPE;
  v_before text;
  v_now timestamptz := now();
  v_reason text := nullif(btrim(COALESCE(p_reason, '')), '');
  v_candidate_error text;
BEGIN
  IF COALESCE((SELECT auth.role()), '') <> 'service_role'
     AND session_user NOT IN ('postgres', 'supabase_admin') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_target_user_id IS NULL OR p_actor_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'user_id_required');
  END IF;
  IF v_reason IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'reason_required');
  END IF;
  IF char_length(v_reason) > 300 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'reason_too_long');
  END IF;

  v_normalized := lower(btrim(replace(COALESCE(p_dibay_id, ''), '@', '')));
  IF v_normalized = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'dibay_id_required');
  END IF;
  IF v_normalized !~ '^[a-z0-9](?:[a-z0-9_.]{2,18}[a-z0-9])$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'dibay_id_invalid_format');
  END IF;
  IF v_normalized IN (
    'admin', 'administrator', 'support', 'owner', 'system', 'official',
    'staff', 'root', 'mod', 'help', 'dibay', 'samarket'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'dibay_id_reserved');
  END IF;
  IF public.dibay_is_system_auto_id(v_normalized) THEN  -- D1
    RETURN jsonb_build_object('ok', false, 'error', 'dibay_id_reserved_pattern');
  END IF;

  SELECT * INTO v_row FROM public.profiles WHERE id = p_target_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'profile_missing');
  END IF;

  v_before := nullif(lower(btrim(COALESCE(v_row.dibay_id, ''))), '');
  IF v_before = v_normalized AND lower(btrim(COALESCE(v_row.username, ''))) = v_normalized THEN
    RETURN jsonb_build_object('ok', true, 'dibay_id', v_normalized, 'idempotent', true);
  END IF;

  v_candidate_error := public.dibay_id_candidate_error(p_target_user_id, v_normalized);
  IF v_candidate_error IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', v_candidate_error);
  END IF;

  UPDATE public.profiles
  SET
    dibay_id = v_normalized,
    username = v_normalized,
    username_confirmed = true,
    username_set_at = COALESCE(username_set_at, v_now),
    dibay_id_auto_assigned = false,
    updated_at = v_now
  WHERE id = p_target_user_id;

  INSERT INTO public.audit_logs (actor_type, actor_id, target_type, target_id, action, before_json, after_json)
  VALUES (
    'admin',
    p_actor_user_id,
    'member',
    p_target_user_id::text,
    'admin_member_dibay_id_change',
    jsonb_build_object('dibay_id', v_before, 'username', v_row.username),
    jsonb_build_object(
      'before', v_before,
      'after', v_normalized,
      'reason', v_reason,
      'member_change_right_used', COALESCE(v_row.dibay_id_changed_once, false),
      'via', 'admin_set_dibay_id'
    )
  );

  RETURN jsonb_build_object('ok', true, 'dibay_id', v_normalized, 'before', v_before);
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'dibay_id_similar_taken');
END;
$function$;

-- ---------------------------------------------------------------------------
-- E2. 변경권 다시 주기 — 본인 변경권을 이미 쓴 회원만 (설계 §3.4)
CREATE OR REPLACE FUNCTION public.admin_grant_dibay_id_change(
  p_target_user_id uuid,
  p_actor_user_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.profiles%ROWTYPE;
  v_reason text := nullif(btrim(COALESCE(p_reason, '')), '');
BEGIN
  IF COALESCE((SELECT auth.role()), '') <> 'service_role'
     AND session_user NOT IN ('postgres', 'supabase_admin') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_target_user_id IS NULL OR p_actor_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'user_id_required');
  END IF;
  IF v_reason IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'reason_required');
  END IF;
  IF char_length(v_reason) > 300 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'reason_too_long');
  END IF;

  SELECT * INTO v_row FROM public.profiles WHERE id = p_target_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'profile_missing');
  END IF;
  IF v_row.dibay_id IS NULL OR btrim(v_row.dibay_id) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'dibay_id_required');
  END IF;
  IF v_row.dibay_id_can_change THEN
    RETURN jsonb_build_object('ok', false, 'error', 'change_right_available');
  END IF;
  -- E2: 본인 변경권을 쓴 회원만 (잠긴 직접 아이디 회원 등 변경권을 쓴 적 없는 회원은 대상 아님)
  IF NOT COALESCE(v_row.dibay_id_changed_once, false) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'change_right_not_used');
  END IF;

  UPDATE public.profiles
  SET
    dibay_id_changed_once = false,
    dibay_id_locked = false,
    updated_at = now()
  WHERE id = p_target_user_id;

  INSERT INTO public.audit_logs (actor_type, actor_id, target_type, target_id, action, before_json, after_json)
  VALUES (
    'admin',
    p_actor_user_id,
    'member',
    p_target_user_id::text,
    'admin_member_dibay_id_change_grant',
    jsonb_build_object(
      'dibay_id', lower(btrim(v_row.dibay_id)),
      'dibay_id_changed_once', COALESCE(v_row.dibay_id_changed_once, false),
      'dibay_id_locked', COALESCE(v_row.dibay_id_locked, false)
    ),
    jsonb_build_object(
      'dibay_id_changed_once', false,
      'dibay_id_locked', false,
      'reason', v_reason,
      'via', 'admin_grant_dibay_id_change'
    )
  );

  RETURN jsonb_build_object('ok', true, 'dibay_id', lower(btrim(v_row.dibay_id)));
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_grant_dibay_id_change(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_grant_dibay_id_change(uuid, uuid, text) TO service_role;

-- ---------------------------------------------------------------------------
-- E3·N1. 친구 요청 — 친구가 된 경로(p_source) 기록. 인자가 늘어 기존 3인자 함수를 지우고 다시 만든다
-- (같은 이름 3인자·4인자 기본값 함수가 함께 있으면 이름 붙인 3인자 호출이 「함수가 하나가 아님」 오류).
-- 본문은 운영 정의(2026-11-11 조회)와 같고 표시한 줄만 바뀐다. 구 웹(3인자 호출)도 기본값으로 동작한다.
DROP FUNCTION IF EXISTS public.cm_send_friend_request(uuid, uuid, text);

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
  v_source text := CASE WHEN p_source IN ('id_search', 'contacts', 'profile', 'qr') THEN p_source ELSE NULL END;
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

COMMIT;
