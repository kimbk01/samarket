-- 고객 문의 남은 위험 6 (5차 재감사, 2026-11-27) — support_append_message 의 글 시각을 **잠금을 얻은 뒤의 시각**으로.
-- 운영 적용 = Owner 별도 승인. 기준 = 운영 현재 정의(20271127230000 적용본, md5 52f8ecbc…).
--
-- 문제: created_at·last_message_at 이 트랜잭션 시작 시각(now())이라, 거의 동시에 쓴 두 글이 잠금을 시작 순서와 반대로
--   얻으면 늦은 시각 글이 먼저 커밋된다 → 그 사이 목록을 읽은 화면의 「읽음 기준 시각」보다 앞선 시각의 글이 나중에 보여
--   미읽음으로 세지지 않을 수 있다(이론상).
-- 수정: 문의 행 잠금(FOR UPDATE) 뒤 clock_timestamp() 로 시각을 정하고, 글 created_at 도 그 값으로 넣는다 →
--   같은 문의 안에서 커밋 순서 = 시각 순서. last_message_at 은 GREATEST 로 뒤로 가지 않게.
-- 그 밖의 규칙(종료 문의 공개 글 거부·메모 분기·전이)은 20271127230000 과 같다.

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
  v_now timestamptz;
  v_status text;
BEGIN
  SELECT status INTO v_status FROM public.support_cases WHERE id = p_case_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'support_case_not_found' USING ERRCODE = 'P0002';
  END IF;
  -- 잠금을 얻은 뒤의 시각 (같은 문의 안에서 커밋 순서 = 시각 순서)
  v_now := clock_timestamp();

  IF p_message_type = 'PUBLIC' AND v_status IN ('RESOLVED', 'ARCHIVED') THEN
    RAISE EXCEPTION 'support_case_closed' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.support_messages (
    case_id, sender_type, sender_user_id, sender_admin_id, message_type, body, created_at
  ) VALUES (
    p_case_id, p_sender_type, p_sender_user_id, p_sender_admin_id, p_message_type, p_body, v_now
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

  RETURN v_msg;
END;
$$;

REVOKE ALL ON FUNCTION public.support_append_message(uuid, text, uuid, uuid, text, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.support_append_message(uuid, text, uuid, uuid, text, text, boolean) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.support_append_message(uuid, text, uuid, uuid, text, text, boolean) TO service_role;

COMMIT;
