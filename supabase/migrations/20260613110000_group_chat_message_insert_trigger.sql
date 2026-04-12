-- group_messages INSERT 시 room.message_seq 증가·seq 부여·last_message_* 비정규화 (동일 트랜잭션)
-- 클라이언트는 seq 를 보내지 않음 — 트리거가 설정

CREATE OR REPLACE FUNCTION public.group_messages_set_seq_and_room_summary()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seq bigint;
BEGIN
  UPDATE public.group_rooms gr
  SET
    message_seq = gr.message_seq + 1,
    last_message_id = NEW.id,
    last_message_at = COALESCE(NEW.created_at, now()),
    last_message_preview = left(COALESCE(NEW.body, ''), 120),
    updated_at = now()
  WHERE gr.id = NEW.room_id
  RETURNING message_seq INTO v_seq;

  IF v_seq IS NULL THEN
    RAISE EXCEPTION 'group room not found: %', NEW.room_id;
  END IF;

  NEW.seq := v_seq;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_group_messages_set_seq ON public.group_messages;
CREATE TRIGGER trg_group_messages_set_seq
  BEFORE INSERT ON public.group_messages
  FOR EACH ROW
  EXECUTE PROCEDURE public.group_messages_set_seq_and_room_summary();

COMMENT ON FUNCTION public.group_messages_set_seq_and_room_summary() IS
  '그룹 메시지 삽입 시 seq·방 요약 갱신 (서비스 롤 INSERT 전제)';
