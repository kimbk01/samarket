-- 메신저 감사 C-8 (docs/dibay-messenger-full-audit-2026-10-21.md 1부 B-4·2부 I) — 방 목록 시각 역행 방지
-- 원인: dibay_append_room_message_atomic 가 last_message_at = v_msg.created_at 를 무조건 기록.
--   call_stub(created_at = 통화 시작 시각) 등 과거 시각 행이 append 되면 목록 시각·미리보기가 과거로 되돌아가
--   rooms UPDATE 이벤트가 연속 발생(목록 깜빡임·순서 오류). send_text RPC 는 이미 forward-only.
-- 수정: 그 UPDATE 1문장만 forward-only(GREATEST + 더 새 행일 때만 미리보기 교체)로 교체. 나머지 본문은 그대로.
-- 안전장치: 운영 함수 본문 md5 가 2026-10-21 확인값과 다르면 아무것도 바꾸지 않고 중단(드리프트 방지).
-- 롤백: 이 파일의 v_old/v_new 를 바꿔 같은 방식으로 되돌린다(본문 1문장 차이).
-- 운영 적용: Owner 별도 명시 승인 후(D6).
DO $migration$
DECLARE
  v_def text;
  v_expected_md5 constant text := 'df6b2a013aea761c0867dddc0ac9fba1';
  v_old constant text := $old$  UPDATE public.community_messenger_rooms
  SET
    last_message = v_preview,
    last_message_at = v_msg.created_at,
    last_message_type = v_msg.message_type,
    updated_at = v_msg.created_at
  WHERE id = p_room_id;$old$;
  v_new constant text := $new$  -- C-8: forward-only — 과거 시각 행(call_stub 등)은 목록 시각·미리보기를 되돌리지 않는다
  UPDATE public.community_messenger_rooms
  SET
    last_message = CASE
      WHEN last_message_at IS NULL OR v_msg.created_at >= last_message_at THEN v_preview
      ELSE last_message
    END,
    last_message_at = GREATEST(coalesce(last_message_at, v_msg.created_at), v_msg.created_at),
    last_message_type = CASE
      WHEN last_message_at IS NULL OR v_msg.created_at >= last_message_at THEN v_msg.message_type
      ELSE last_message_type
    END,
    updated_at = GREATEST(coalesce(updated_at, v_msg.created_at), v_msg.created_at)
  WHERE id = p_room_id;$new$;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p
  WHERE p.oid = 'public.dibay_append_room_message_atomic(text,uuid,text,text,uuid,text,text,text,jsonb,timestamp with time zone,boolean,text,boolean)'::regprocedure;
  IF md5(v_def) IS DISTINCT FROM v_expected_md5 THEN
    RAISE EXCEPTION 'C-8 guard: dibay_append_room_message_atomic drifted (md5 %), aborting', md5(v_def);
  END IF;
  IF position(v_old in v_def) = 0 THEN
    RAISE EXCEPTION 'C-8 guard: target UPDATE block not found, aborting';
  END IF;
  EXECUTE replace(v_def, v_old, v_new);
END
$migration$;
