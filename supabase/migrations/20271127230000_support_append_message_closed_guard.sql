-- 고객 문의 SSOT 재감사 (2026-11-27) D4·D13 — support_append_message 만 다시 정의.
-- 운영 적용 = Owner 별도 승인 (AGENTS.md 개발 프로세스 2번). 앱 코드는 이 함수 적용 여부와 무관하게 동작한다
-- (적용 전: TS 상태 확인만 · 적용 후: 같은 트랜잭션 잠금 안에서 한 번 더 막음 → 오류 문구 support_case_closed → case_closed).
--
-- D4: 상태 확인(TS)과 글 쓰기 사이에 종료가 끼면 종료 문의가 재오픈 기록 없이 진행 중으로 돌아갔다
--     → 잠금(FOR UPDATE) 뒤 RESOLVED·ARCHIVED 면 공개 글을 거부한다. 어드민 메모(INTERNAL_NOTE)는 종료 문의에도 허용(기존과 같음).
-- D13: 어드민 메모가 last_message_at 을 바꿔 7일 자동 종료 시계를 다시 시작했다
--     → 메모·시스템 글은 updated_at 만 바꾼다(고객·어드민 공개 글만 「마지막 글」).
-- 그 밖의 전이 규칙은 20270415120000 과 같다.

BEGIN;

CREATE OR REPLACE FUNCTION public.support_append_message(
  p_case_id uuid,
  p_sender_type text,
  p_sender_user_id uuid,
  p_sender_admin_id uuid,
  p_message_type text,
  p_body text,
  p_system_seed boolean DEFAULT false
)
RETURNS public.support_messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_msg public.support_messages;
  v_now timestamptz := now();
  v_status text;
BEGIN
  SELECT status INTO v_status FROM public.support_cases WHERE id = p_case_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'support_case_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF p_message_type = 'PUBLIC' AND v_status IN ('RESOLVED', 'ARCHIVED') THEN
    RAISE EXCEPTION 'support_case_closed' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.support_messages (
    case_id, sender_type, sender_user_id, sender_admin_id, message_type, body
  ) VALUES (
    p_case_id, p_sender_type, p_sender_user_id, p_sender_admin_id, p_message_type, p_body
  )
  RETURNING * INTO v_msg;

  IF p_sender_type = 'ADMIN' AND p_message_type = 'PUBLIC' THEN
    UPDATE public.support_cases
       SET status = 'WAITING_USER',
           requester_unread_count = requester_unread_count + 1,
           first_admin_response_at = COALESCE(first_admin_response_at, v_now),
           last_message_at = v_now,
           updated_at = v_now
     WHERE id = p_case_id;
  ELSIF p_sender_type IN ('MEMBER', 'OWNER') AND NOT COALESCE(p_system_seed, false) THEN
    UPDATE public.support_cases
       SET status = 'WAITING_ADMIN',
           admin_unread_count = admin_unread_count + 1,
           last_message_at = v_now,
           updated_at = v_now
     WHERE id = p_case_id;
  ELSIF p_message_type = 'PUBLIC' THEN
    -- 고객 시드(접수 첫 글) — 마지막 글 시각만
    UPDATE public.support_cases
       SET last_message_at = v_now,
           updated_at = v_now
     WHERE id = p_case_id;
  ELSE
    -- 어드민 메모(INTERNAL_NOTE) — 「마지막 글」이 아니다 (D13)
    UPDATE public.support_cases
       SET updated_at = v_now
     WHERE id = p_case_id;
  END IF;

  RETURN v_msg;
END;
$$;

REVOKE ALL ON FUNCTION public.support_append_message(uuid, text, uuid, uuid, text, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.support_append_message(uuid, text, uuid, uuid, text, text, boolean) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.support_append_message(uuid, text, uuid, uuid, text, text, boolean) TO service_role;

COMMIT;
