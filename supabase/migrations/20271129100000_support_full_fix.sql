-- 고객센터 문의 전체 수정 (2026-11-29) — 공통 계약 docs/audit/customer-support-full-fix-contract-2026-11-28.md §1·§2·§6
-- 결함: S-1·S-2·S-3(요청 id 멱등) · S-4·S-5(접수 한 트랜잭션) · S-15·S-16·S-17(상태 전이 표 한 트랜잭션) · B-4(dedupe 인덱스) · S-8(재생 SQL 권한 판정)
-- 운영 적용 = Owner 별도 승인. 순서 고정: 「이 파일 운영 적용 → 웹 병합」 (웹은 새 함수가 있어야 동작).
-- 되돌리기 = supabase/rollback/20271129100000_support_full_fix_rollback.sql (웹을 먼저 되돌린 뒤).
-- 기준 정의(저장소 최신):
--   support_append_message = 20271127250000 (잠금 뒤 clock_timestamp)
--   admin_notification_replay_support_replies = 20271127240000
--   internal.support_admin_has_support_permission = 20271128210000 (정지 운영자 제외 · 운영 적용 2026-11-28)
--   표 = 20261202170000 · 20261203010000 · 20270415120000(uq_support_cases_one_active_per_key) · 20270416120000(edited_at·deleted_at)
--
-- ── 바꾸는 것 ───────────────────────────────────────────────────────────────
-- 1) support_messages.client_request_id uuid NULL + 유일 부분 인덱스 (요청 id 멱등 · 계약 §1)
-- 2) support_append_message(… , p_client_request_id uuid DEFAULT NULL) — 같은 id 의 글이 있으면 새로 쓰지 않고 그 글 + replayed=true.
--    반환형 support_messages → jsonb(글 열 전부 + replayed). 옛 웹(7개 인자 호출)은 기본값으로 같은 함수를 부르고, 받은 객체의 글 열은 같다.
--    반환형이 바뀌어 CREATE OR REPLACE 가 안 되므로 옛 7개 인자 함수를 지우고 새로 만든다(같은 이름 두 벌이면 PostgREST 가 고르지 못함).
-- 3) support_open_case(…) — 접수 한 트랜잭션: 같은 진행 중 키 advisory 잠금 → 요청 id replay → 진행 중 문의(FOR UPDATE) 있으면 글 붙이기
--    / 없으면 문의·세션(ON CONFLICT DO NOTHING)·첫 글·case_created. 붙이는 글 상한 8000자(S-5). 검증(분야·안내문·참조·매장 소유·속도 제한)은 TS 가 먼저.
-- 4) support_transition_case(…) — 상태 전이 표 하나(종료·확인했어요·자동 종료·보관·보관 해제·재오픈·담당·우선순위).
--    상태·미읽음·세션·사건·어드민 알림 읽음을 같은 트랜잭션. 이미 목표 상태면 changed=false 로 ok(멱등).
-- 5) admin_notifications (dedupe_key) 인덱스 (B-4 — 키 단독 조회·재생 SQL 의 not exists)
-- 6) admin_notification_replay_support_replies — 담당자 판정 internal.is_platform_admin → internal.support_admin_has_support_permission (S-8).
--    담당자가 support 권한이 없으면(정지·권한 회수) 건너뛰지 않고 support 어드민 전원으로 재생한다(앱 즉시 발송의 「받을 수 없는 담당자 → 전원」과 같게).
-- 7) admin_notifications 를 supabase_realtime 에 등록 (A-2 — 어드민 헤더 숫자 신호)
--
-- ── 바꾸지 않는 것 ─────────────────────────────────────────────────────────
-- · RLS 정책 · 표 열(1 제외) · 쓰기 권한(service_role 만) · 기존 데이터.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) 요청 id
-- ---------------------------------------------------------------------------
ALTER TABLE public.support_messages
  ADD COLUMN IF NOT EXISTS client_request_id uuid NULL;

COMMENT ON COLUMN public.support_messages.client_request_id IS
  '고객센터 전체 수정 §1 (2026-11-29): 쓰기 요청 id(클라이언트 uuid). 같은 id 재전송 = 새 글 없이 처음 결과(replayed).';

CREATE UNIQUE INDEX IF NOT EXISTS uq_support_messages_client_request_id
  ON public.support_messages (client_request_id)
  WHERE client_request_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2) support_append_message + 요청 id
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.support_append_message(uuid, text, uuid, uuid, text, text, boolean);

CREATE OR REPLACE FUNCTION public.support_append_message(
  p_case_id uuid,
  p_sender_type text,
  p_sender_user_id uuid,
  p_sender_admin_id uuid,
  p_message_type text,
  p_body text,
  p_system_seed boolean DEFAULT false,
  p_client_request_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_msg public.support_messages;
  v_prev public.support_messages;
  v_now timestamptz;
  v_status text;
BEGIN
  SELECT status INTO v_status FROM public.support_cases WHERE id = p_case_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'support_case_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- 계약 §1: 같은 요청 id 의 글이 이미 있으면 새로 쓰지 않는다 (문의 잠금 뒤라 같은 문의의 재전송은 차례로 본다).
  -- 종료 확인보다 먼저 — 종료 전에 저장된 글의 재전송도 처음 결과를 돌려준다.
  IF p_client_request_id IS NOT NULL THEN
    SELECT * INTO v_prev FROM public.support_messages WHERE client_request_id = p_client_request_id;
    IF FOUND THEN
      IF v_prev.case_id IS DISTINCT FROM p_case_id
         OR v_prev.sender_type IS DISTINCT FROM p_sender_type
         OR v_prev.sender_user_id IS DISTINCT FROM p_sender_user_id
         OR v_prev.sender_admin_id IS DISTINCT FROM p_sender_admin_id
         OR v_prev.message_type IS DISTINCT FROM p_message_type THEN
        RAISE EXCEPTION 'support_request_id_conflict' USING ERRCODE = 'P0001';
      END IF;
      RETURN to_jsonb(v_prev) || jsonb_build_object('replayed', true);
    END IF;
  END IF;

  -- 잠금을 얻은 뒤의 시각 (같은 문의 안에서 커밋 순서 = 시각 순서 · 20271127250000 과 같다)
  v_now := clock_timestamp();

  IF p_message_type = 'PUBLIC' AND v_status IN ('RESOLVED', 'ARCHIVED') THEN
    RAISE EXCEPTION 'support_case_closed' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.support_messages (
    case_id, sender_type, sender_user_id, sender_admin_id, message_type, body, created_at, client_request_id
  ) VALUES (
    p_case_id, p_sender_type, p_sender_user_id, p_sender_admin_id, p_message_type, p_body, v_now, p_client_request_id
  )
  RETURNING * INTO v_msg;

  IF p_sender_type = 'ADMIN' AND p_message_type = 'PUBLIC' THEN
    UPDATE public.support_cases
       SET status = 'WAITING_USER',
           requester_unread_count = requester_unread_count + 1,
           first_admin_response_at = COALESCE(first_admin_response_at, v_now),
           last_message_at = GREATEST(last_message_at, v_now),
           updated_at = v_now
     WHERE id = p_case_id;
  ELSIF p_sender_type IN ('MEMBER', 'OWNER') AND NOT COALESCE(p_system_seed, false) THEN
    UPDATE public.support_cases
       SET status = 'WAITING_ADMIN',
           admin_unread_count = admin_unread_count + 1,
           last_message_at = GREATEST(last_message_at, v_now),
           updated_at = v_now
     WHERE id = p_case_id;
  ELSIF p_message_type = 'PUBLIC' THEN
    UPDATE public.support_cases
       SET last_message_at = GREATEST(last_message_at, v_now),
           updated_at = v_now
     WHERE id = p_case_id;
  ELSE
    -- 어드민 메모(INTERNAL_NOTE) — 「마지막 글」이 아니다 (D13)
    UPDATE public.support_cases
       SET updated_at = v_now
     WHERE id = p_case_id;
  END IF;

  RETURN to_jsonb(v_msg) || jsonb_build_object('replayed', false);
END;
$$;

REVOKE ALL ON FUNCTION public.support_append_message(uuid, text, uuid, uuid, text, text, boolean, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.support_append_message(uuid, text, uuid, uuid, text, text, boolean, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.support_append_message(uuid, text, uuid, uuid, text, text, boolean, uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 3) support_open_case — 접수 한 트랜잭션 (S-1·S-4·S-5)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.support_open_case(
  p_requester_user_id uuid,
  p_audience text,
  p_owner_store_id uuid,
  p_category text,
  p_issue_type text,
  p_subject text,
  p_source_surface text,
  p_reference_type text,
  p_reference_id text,
  p_initial_summary text,
  p_guidance_key text,
  p_guidance_revision integer,
  p_guidance_outcome text,
  p_first_body text,
  p_first_is_seed boolean,
  p_followup_body text,
  p_event_payload jsonb DEFAULT '{}'::jsonb,
  p_client_request_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_case public.support_cases;
  v_prev public.support_messages;
  v_msg jsonb := NULL;
  v_session_id uuid;
  v_now timestamptz;
  v_no text;
  v_sender text;
  v_followup text;
  v_first text;
  v_created boolean;
BEGIN
  IF p_requester_user_id IS NULL OR p_audience NOT IN ('MEMBER', 'OWNER') OR coalesce(btrim(p_category), '') = '' THEN
    RAISE EXCEPTION 'support_open_invalid_input' USING ERRCODE = '22023';
  END IF;
  IF (p_audience = 'OWNER') <> (p_owner_store_id IS NOT NULL) THEN
    RAISE EXCEPTION 'support_open_invalid_input' USING ERRCODE = '22023';
  END IF;
  v_sender := CASE WHEN p_audience = 'OWNER' THEN 'OWNER' ELSE 'MEMBER' END;

  -- 같은 진행 중 키(uq_support_cases_one_active_per_key 와 같은 열)를 트랜잭션 끝까지 잠근다 — 동시 접수는 차례로.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'support_open|' || p_requester_user_id::text || '|' || p_audience || '|' || p_category || '|'
      || COALESCE(p_owner_store_id::text, '') || '|' || COALESCE(p_reference_type, '') || '|' || COALESCE(p_reference_id, ''),
    0
  ));

  -- 계약 §1: 같은 요청 id 로 이미 접수됐다 → 처음 결과(같은 문의 · 같은 created)
  IF p_client_request_id IS NOT NULL THEN
    SELECT * INTO v_prev FROM public.support_messages WHERE client_request_id = p_client_request_id;
    IF FOUND THEN
      SELECT * INTO v_case FROM public.support_cases WHERE id = v_prev.case_id;
      IF NOT FOUND
         OR v_case.requester_user_id IS DISTINCT FROM p_requester_user_id
         OR v_prev.sender_user_id IS DISTINCT FROM p_requester_user_id THEN
        RAISE EXCEPTION 'support_request_id_conflict' USING ERRCODE = 'P0001';
      END IF;
      v_created := NOT EXISTS (
        SELECT 1 FROM public.support_messages p
         WHERE p.case_id = v_prev.case_id AND p.created_at < v_prev.created_at
      );
      SELECT id INTO v_session_id FROM public.support_sessions WHERE case_id = v_case.id AND closed_at IS NULL;
      RETURN jsonb_build_object(
        'case', to_jsonb(v_case),
        'created', v_created,
        'replayed', true,
        'message', to_jsonb(v_prev),
        'session_id', v_session_id
      );
    END IF;
  END IF;

  -- 진행 중 문의 (같은 키). FOR UPDATE — 그사이 종료 중이면 기다린 뒤 다시 확인해 종료됐으면 새 문의로 간다.
  SELECT * INTO v_case
    FROM public.support_cases c
   WHERE c.requester_user_id = p_requester_user_id
     AND c.audience = p_audience
     AND c.category = p_category
     AND COALESCE(c.owner_store_id::text, '') = COALESCE(p_owner_store_id::text, '')
     AND COALESCE(c.reference_type, '') = COALESCE(p_reference_type, '')
     AND COALESCE(c.reference_id, '') = COALESCE(p_reference_id, '')
     AND c.status IN ('OPEN', 'WAITING_ADMIN', 'WAITING_USER')
   ORDER BY c.last_message_at DESC
   LIMIT 1
   FOR UPDATE;

  IF FOUND THEN
    v_followup := left(btrim(COALESCE(p_followup_body, '')), 8000);
    IF v_followup <> '' THEN
      v_msg := public.support_append_message(
        v_case.id, v_sender, p_requester_user_id, NULL, 'PUBLIC', v_followup, false, p_client_request_id
      );
      -- SSOT §6 (F4): 다른 세부를 골라 접수했는데 같은 분야 진행 중 문의에 붙었다 → 고른 세부를 사건 기록에
      IF p_issue_type IS NOT NULL AND p_issue_type IS DISTINCT FROM v_case.issue_type THEN
        INSERT INTO public.support_case_events (case_id, event_type, actor_user_id, payload)
        VALUES (
          v_case.id, 'followup_issue_selected', p_requester_user_id,
          jsonb_build_object('issue_type', p_issue_type, 'message_id', v_msg ->> 'id')
        );
      END IF;
    END IF;
    INSERT INTO public.support_sessions (case_id, requester_user_id)
    VALUES (v_case.id, p_requester_user_id)
    ON CONFLICT (case_id) WHERE closed_at IS NULL DO NOTHING;
    SELECT id INTO v_session_id FROM public.support_sessions WHERE case_id = v_case.id AND closed_at IS NULL;
    SELECT * INTO v_case FROM public.support_cases WHERE id = v_case.id;
    RETURN jsonb_build_object(
      'case', to_jsonb(v_case),
      'created', false,
      'replayed', false,
      'message', v_msg,
      'session_id', v_session_id
    );
  END IF;

  -- 새 문의
  v_first := left(btrim(COALESCE(p_first_body, '')), 8000);
  IF v_first = '' THEN
    RAISE EXCEPTION 'support_open_empty_body' USING ERRCODE = '22023';
  END IF;
  v_no := public.allocate_support_public_case_no();
  v_now := clock_timestamp();
  INSERT INTO public.support_cases (
    public_case_no, audience, requester_user_id, owner_store_id, category, issue_type, subject, source_surface,
    reference_type, reference_id, initial_summary, guidance_key, guidance_revision, guidance_outcome,
    status, priority, admin_unread_count, requester_unread_count, last_message_at, updated_at
  ) VALUES (
    v_no, p_audience, p_requester_user_id, p_owner_store_id, p_category, p_issue_type, COALESCE(p_subject, ''),
    COALESCE(p_source_surface, ''), p_reference_type, p_reference_id, p_initial_summary, p_guidance_key,
    p_guidance_revision, p_guidance_outcome,
    -- SSOT §4 (F2): 첫 글이 시드면 함수가 숫자를 올리지 않으므로 1 로 시작 · 시드가 아니면 함수가 +1
    'OPEN', 'NORMAL', CASE WHEN COALESCE(p_first_is_seed, false) THEN 1 ELSE 0 END, 0, v_now, v_now
  )
  RETURNING * INTO v_case;

  INSERT INTO public.support_sessions (case_id, requester_user_id)
  VALUES (v_case.id, p_requester_user_id)
  ON CONFLICT (case_id) WHERE closed_at IS NULL DO NOTHING;
  SELECT id INTO v_session_id FROM public.support_sessions WHERE case_id = v_case.id AND closed_at IS NULL;

  v_msg := public.support_append_message(
    v_case.id, v_sender, p_requester_user_id, NULL, 'PUBLIC', v_first, COALESCE(p_first_is_seed, false), p_client_request_id
  );

  INSERT INTO public.support_case_events (case_id, event_type, actor_user_id, payload)
  VALUES (v_case.id, 'case_created', p_requester_user_id, COALESCE(p_event_payload, '{}'::jsonb));

  SELECT * INTO v_case FROM public.support_cases WHERE id = v_case.id;
  RETURN jsonb_build_object(
    'case', to_jsonb(v_case),
    'created', true,
    'replayed', false,
    'message', v_msg,
    'session_id', v_session_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.support_open_case(uuid, text, uuid, text, text, text, text, text, text, text, text, integer, text, text, boolean, text, jsonb, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.support_open_case(uuid, text, uuid, text, text, text, text, text, text, text, text, integer, text, text, boolean, text, jsonb, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.support_open_case(uuid, text, uuid, text, text, text, text, text, text, text, text, integer, text, text, boolean, text, jsonb, uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 4) support_transition_case — 상태 전이 표 (S-15·S-16·S-17)
--   admin_resolve   OPEN·WAITING_ADMIN·WAITING_USER → RESOLVED (+본 시각 CAS)       이미 RESOLVED·ARCHIVED = ok(changed=false)
--   requester_close WAITING_USER → RESOLVED (+본 시각 CAS · 요청자 본인)             이미 종료 = ok · OPEN·WAITING_ADMIN = invalid_transition
--   auto_close      WAITING_USER 이고 마지막 글 시각 그대로 → RESOLVED               아니면 ok(changed=false, 건너뜀)
--   archive         RESOLVED → ARCHIVED                                               이미 ARCHIVED = ok · 진행 중 = not_closed
--   unarchive       ARCHIVED → RESOLVED                                               이미 RESOLVED = ok · 진행 중 = invalid_transition
--   reopen          RESOLVED·ARCHIVED → OPEN                                          이미 진행 중 = ok · 같은 키 진행 중 문의 있음 = active_case_exists
--   assign          진행 중만 · 기대 담당자 CAS                                       같은 사람 = ok · 종료 = case_closed · 경합 = case_updated
--   priority        진행 중만                                                         같은 값 = ok · 종료 = case_closed
-- 본 시각 비교는 밀리초 단위(웹 Date 와 같은 정밀도).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.support_transition_case(
  p_case_id uuid,
  p_action text,
  p_actor_user_id uuid DEFAULT NULL,
  p_seen_last_message_at timestamptz DEFAULT NULL,
  p_expected_assignee uuid DEFAULT NULL,
  p_assignee uuid DEFAULT NULL,
  p_priority text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_case public.support_cases;
  v_prev_status text;
  v_prev_assignee uuid;
  v_now timestamptz;
  v_active boolean;
  v_closed boolean;
  v_seen_changed boolean;
BEGIN
  SELECT * INTO v_case FROM public.support_cases WHERE id = p_case_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found', 'changed', false);
  END IF;
  v_prev_status := v_case.status;
  v_prev_assignee := v_case.assigned_admin_id;
  v_now := clock_timestamp();
  v_active := v_case.status IN ('OPEN', 'WAITING_ADMIN', 'WAITING_USER');
  v_closed := v_case.status IN ('RESOLVED', 'ARCHIVED');
  v_seen_changed := p_seen_last_message_at IS NOT NULL
    AND date_trunc('milliseconds', v_case.last_message_at) <> date_trunc('milliseconds', p_seen_last_message_at);

  IF p_action = 'admin_resolve' THEN
    IF v_closed THEN
      RETURN jsonb_build_object('ok', true, 'changed', false, 'case', to_jsonb(v_case), 'previous_status', v_prev_status);
    END IF;
    IF v_seen_changed THEN
      RETURN jsonb_build_object('ok', false, 'error', 'case_updated', 'changed', false, 'case', to_jsonb(v_case));
    END IF;
    UPDATE public.support_cases
       SET status = 'RESOLVED', resolved_at = v_now, updated_at = v_now, admin_unread_count = 0
     WHERE id = p_case_id
     RETURNING * INTO v_case;
    UPDATE public.support_sessions SET closed_at = v_now, last_seen_at = v_now
     WHERE case_id = p_case_id AND closed_at IS NULL;
    INSERT INTO public.support_case_events (case_id, event_type, actor_user_id, payload)
    VALUES (p_case_id, 'status_changed', p_actor_user_id, jsonb_build_object('status', 'RESOLVED'));

  ELSIF p_action = 'requester_close' THEN
    IF v_case.requester_user_id IS DISTINCT FROM p_actor_user_id THEN
      RETURN jsonb_build_object('ok', false, 'error', 'forbidden', 'changed', false);
    END IF;
    IF v_closed THEN
      RETURN jsonb_build_object('ok', true, 'changed', false, 'case', to_jsonb(v_case), 'previous_status', v_prev_status);
    END IF;
    IF v_case.status <> 'WAITING_USER' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'invalid_transition', 'changed', false, 'case', to_jsonb(v_case));
    END IF;
    IF v_seen_changed THEN
      RETURN jsonb_build_object('ok', false, 'error', 'case_updated', 'changed', false, 'case', to_jsonb(v_case));
    END IF;
    UPDATE public.support_cases
       SET status = 'RESOLVED', resolved_at = v_now, updated_at = v_now,
           requester_unread_count = 0, admin_unread_count = 0
     WHERE id = p_case_id
     RETURNING * INTO v_case;
    UPDATE public.support_sessions SET closed_at = v_now, last_seen_at = v_now
     WHERE case_id = p_case_id AND closed_at IS NULL;
    INSERT INTO public.support_case_events (case_id, event_type, actor_user_id, payload)
    VALUES (p_case_id, 'status_changed', p_actor_user_id, jsonb_build_object('status', 'RESOLVED', 'by', 'requester'));

  ELSIF p_action = 'auto_close' THEN
    IF v_case.status <> 'WAITING_USER' OR v_seen_changed THEN
      RETURN jsonb_build_object('ok', true, 'changed', false, 'case', to_jsonb(v_case), 'previous_status', v_prev_status);
    END IF;
    UPDATE public.support_cases
       SET status = 'RESOLVED', resolved_at = v_now, updated_at = v_now, admin_unread_count = 0
     WHERE id = p_case_id
     RETURNING * INTO v_case;
    UPDATE public.support_sessions SET closed_at = v_now, last_seen_at = v_now
     WHERE case_id = p_case_id AND closed_at IS NULL;
    INSERT INTO public.support_case_events (case_id, event_type, actor_user_id, payload)
    VALUES (p_case_id, 'status_changed', NULL, jsonb_build_object('status', 'RESOLVED', 'by', 'auto_7d'));

  ELSIF p_action = 'archive' THEN
    IF v_case.status = 'ARCHIVED' THEN
      RETURN jsonb_build_object('ok', true, 'changed', false, 'case', to_jsonb(v_case), 'previous_status', v_prev_status);
    END IF;
    IF v_case.status <> 'RESOLVED' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'not_closed', 'changed', false, 'case', to_jsonb(v_case));
    END IF;
    UPDATE public.support_cases
       SET status = 'ARCHIVED', archived_at = v_now, updated_at = v_now, admin_unread_count = 0
     WHERE id = p_case_id
     RETURNING * INTO v_case;
    INSERT INTO public.support_case_events (case_id, event_type, actor_user_id, payload)
    VALUES (p_case_id, 'status_changed', p_actor_user_id, jsonb_build_object('status', 'ARCHIVED'));

  ELSIF p_action = 'unarchive' THEN
    IF v_case.status = 'RESOLVED' THEN
      RETURN jsonb_build_object('ok', true, 'changed', false, 'case', to_jsonb(v_case), 'previous_status', v_prev_status);
    END IF;
    IF v_case.status <> 'ARCHIVED' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'invalid_transition', 'changed', false, 'case', to_jsonb(v_case));
    END IF;
    UPDATE public.support_cases
       SET status = 'RESOLVED', archived_at = NULL, updated_at = v_now
     WHERE id = p_case_id
     RETURNING * INTO v_case;
    INSERT INTO public.support_case_events (case_id, event_type, actor_user_id, payload)
    VALUES (p_case_id, 'status_changed', p_actor_user_id, jsonb_build_object('status', 'RESOLVED'));

  ELSIF p_action = 'reopen' THEN
    IF v_active THEN
      RETURN jsonb_build_object('ok', true, 'changed', false, 'case', to_jsonb(v_case), 'previous_status', v_prev_status);
    END IF;
    -- 재감사 2 (2026-11-29): 접수(support_open_case)와 같은 진행 중 키 잠금 — 접수와 재오픈이 겹치면 차례로 처리한다.
    --   접수가 먼저면 새 문의가 진행 중이 되어 아래 UPDATE 가 active_case_exists, 재오픈이 먼저면 접수가 그 문의에 붙는다
    --   (잠금 없으면 접수 INSERT 가 유일 키에 걸려 고객이 409 를 받았다). 잠금 순서: 문의 행 → 키 잠금, 접수는 키 잠금 뒤 진행 중 행만.
    PERFORM pg_advisory_xact_lock(hashtextextended(
      'support_open|' || v_case.requester_user_id::text || '|' || v_case.audience || '|' || v_case.category || '|'
        || COALESCE(v_case.owner_store_id::text, '') || '|' || COALESCE(v_case.reference_type, '') || '|' || COALESCE(v_case.reference_id, ''),
      0
    ));
    BEGIN
      UPDATE public.support_cases
         SET status = 'OPEN', resolved_at = NULL, archived_at = NULL, updated_at = v_now, last_message_at = v_now
       WHERE id = p_case_id
       RETURNING * INTO v_case;
    EXCEPTION WHEN unique_violation THEN
      RETURN jsonb_build_object('ok', false, 'error', 'active_case_exists', 'changed', false);
    END;
    INSERT INTO public.support_sessions (case_id, requester_user_id)
    VALUES (p_case_id, v_case.requester_user_id)
    ON CONFLICT (case_id) WHERE closed_at IS NULL DO NOTHING;
    INSERT INTO public.support_case_events (case_id, event_type, actor_user_id, payload)
    VALUES (p_case_id, 'reopened', p_actor_user_id, '{}'::jsonb);

  ELSIF p_action = 'assign' THEN
    IF v_closed THEN
      RETURN jsonb_build_object('ok', false, 'error', 'case_closed', 'changed', false, 'case', to_jsonb(v_case));
    END IF;
    IF v_case.assigned_admin_id IS NOT DISTINCT FROM p_assignee THEN
      RETURN jsonb_build_object('ok', true, 'changed', false, 'case', to_jsonb(v_case), 'previous_assignee', v_prev_assignee);
    END IF;
    IF v_case.assigned_admin_id IS DISTINCT FROM p_expected_assignee THEN
      RETURN jsonb_build_object('ok', false, 'error', 'case_updated', 'changed', false, 'case', to_jsonb(v_case));
    END IF;
    UPDATE public.support_cases
       SET assigned_admin_id = p_assignee, updated_at = v_now
     WHERE id = p_case_id
     RETURNING * INTO v_case;
    INSERT INTO public.support_case_events (case_id, event_type, actor_user_id, payload)
    VALUES (
      p_case_id, 'assigned', p_actor_user_id,
      jsonb_build_object('assigned_admin_id', p_assignee, 'previous_assignee', v_prev_assignee)
    );

  ELSIF p_action = 'priority' THEN
    IF p_priority IS NULL OR p_priority NOT IN ('NORMAL', 'HIGH', 'URGENT') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'invalid_priority', 'changed', false);
    END IF;
    IF v_closed THEN
      RETURN jsonb_build_object('ok', false, 'error', 'case_closed', 'changed', false, 'case', to_jsonb(v_case));
    END IF;
    IF v_case.priority = p_priority THEN
      RETURN jsonb_build_object('ok', true, 'changed', false, 'case', to_jsonb(v_case));
    END IF;
    UPDATE public.support_cases
       SET priority = p_priority, updated_at = v_now
     WHERE id = p_case_id
     RETURNING * INTO v_case;
    INSERT INTO public.support_case_events (case_id, event_type, actor_user_id, payload)
    VALUES (p_case_id, 'priority_changed', p_actor_user_id, jsonb_build_object('priority', p_priority));

  ELSE
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_action', 'changed', false);
  END IF;

  -- 어드민 일이 끝났다(종료·확인했어요·자동 종료·보관) → 그 문의 어드민 알림을 받은 어드민 전원 읽음 (같은 트랜잭션 · S-16)
  IF p_action IN ('admin_resolve', 'requester_close', 'auto_close', 'archive') THEN
    UPDATE public.admin_notifications
       SET read_at = v_now
     WHERE work_ref_table = 'support_cases'
       AND work_ref_id = p_case_id::text
       AND kind IN ('support_customer_replied', 'support_case_assigned')
       AND read_at IS NULL;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'changed', true,
    'case', to_jsonb(v_case),
    'previous_status', v_prev_status,
    'previous_assignee', v_prev_assignee
  );
END;
$$;

REVOKE ALL ON FUNCTION public.support_transition_case(uuid, text, uuid, timestamptz, uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.support_transition_case(uuid, text, uuid, timestamptz, uuid, uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.support_transition_case(uuid, text, uuid, timestamptz, uuid, uuid, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 5) B-4 — dedupe 키 단독 조회 (재생 SQL not exists · 답변 정리 · 알림 되살림)
-- ---------------------------------------------------------------------------
-- 주의: CONCURRENTLY 가 아니다(이 파일은 BEGIN…COMMIT 한 트랜잭션이라 쓸 수 없다) — 인덱스를 만드는 동안 admin_notifications 에
--   쓰기 잠금(SHARE)이 걸려 어드민 알림 저장·읽음 처리가 그 시간만큼 기다린다. 적용 전 행 수를 읽기 전용으로 확인하고,
--   많으면 이 문장을 빼고 트랜잭션 밖에서 CREATE INDEX CONCURRENTLY 로 따로 만든다.
CREATE INDEX IF NOT EXISTS idx_admin_notifications_dedupe_key
  ON public.admin_notifications (dedupe_key);

-- ---------------------------------------------------------------------------
-- 6) S-8 — 재생 SQL 의 담당자 판정 = support 권한 함수 (RLS 와 같은 판정)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_notification_replay_support_replies(p_lookback interval DEFAULT '72:00:00'::interval, p_limit integer DEFAULT 200)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_count integer := 0;
  r record;
  v_payload jsonb;
begin
  for r in
    select m.id as message_id, m.body, m.sender_user_id, c.id as case_id, c.public_case_no,
           c.assigned_admin_id,
           -- 담당자가 support 권한(활성·정지 아님·support)이 있을 때만 담당자에게, 아니면 전원
           (c.assigned_admin_id is not null
             and internal.support_admin_has_support_permission(c.assigned_admin_id)) as assignee_ok,
           not exists (
             select 1 from public.support_messages p
              where p.case_id = m.case_id
                and p.message_type = 'PUBLIC'
                and p.sender_type in ('MEMBER', 'OWNER')
                and p.created_at < m.created_at
           ) as is_first
      from public.support_messages m
      join public.support_cases c on c.id = m.case_id
     where m.message_type = 'PUBLIC'
       and m.sender_type in ('MEMBER', 'OWNER')
       and m.deleted_at is null
       and m.created_at > now() - p_lookback
       and c.status in ('OPEN', 'WAITING_ADMIN')
       and not exists (
         select 1 from public.admin_notifications n
          where n.dedupe_key = 'support_customer_replied:' || m.id::text
       )
       and not exists (
         select 1 from public.notification_events e
          where c.assigned_admin_id is not null
            and e.user_id = c.assigned_admin_id
            and e.dedupe_key = 'support_customer_replied:' || m.id::text
       )
       and not exists (
         select 1 from public.admin_notification_outbox o
          where o.source_key = 'support_customer_replied:' || m.id::text
       )
     order by m.created_at
     limit greatest(1, least(p_limit, 1000))
  loop
    v_payload := jsonb_build_object(
      'kind', 'support_customer_replied',
      'title', case when r.is_first then '새 고객 문의 · ' else '고객 추가 문의 · ' end || r.public_case_no,
      'body', left(r.body, 500),
      'linkUrl', '/admin/support/' || r.case_id::text,
      'workRef', jsonb_build_object('table', 'support_cases', 'id', r.case_id),
      'dedupeKey', 'support_customer_replied:' || r.message_id::text,
      'actorUserId', r.sender_user_id,
      'requiredPermission', 'support',
      'excludeRecipientIds', jsonb_build_array(r.sender_user_id),
      'push', true
    );
    if r.assignee_ok then
      v_payload := v_payload || jsonb_build_object('recipientAdminIds', jsonb_build_array(r.assigned_admin_id));
    else
      v_payload := v_payload || jsonb_build_object('broadcastPermission', 'support');
    end if;

    if public.admin_notification_outbox_enqueue(
      'support_customer_replied:' || r.message_id::text,
      'support_customer_replied',
      v_payload,
      null
    ) then
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 7) admin_notifications 실시간 등록 (A-2 — 어드민 헤더 받은 알림 숫자 신호)
--   운영 확인 2026-11-28(읽기 전용): supabase_realtime 에 notification_events·support_cases·support_messages 는 있고
--   admin_notifications 는 없음. 콘솔 공통 구독이 `recipient_admin_id=eq.<본인>` 으로 듣는다(RLS select_own_active_admin 그대로).
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND to_regclass('public.admin_notifications') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'admin_notifications'
     ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_notifications';
  END IF;
END $$;

COMMIT;
