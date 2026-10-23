-- D-1 원자성 로컬 실측 (격리 스키마 · public.community_messenger_messages 미사용 · 백필 없음)
-- psql -h 127.0.0.1 -p 5432 -d postgres -v ON_ERROR_STOP=1 -f scripts/sql/verify-d1-delete-reply-scrub-atomicity.sql

DROP SCHEMA IF EXISTS d1_atomicity_verify CASCADE;
CREATE SCHEMA d1_atomicity_verify;

CREATE TABLE d1_atomicity_verify.messages (
  id uuid PRIMARY KEY,
  room_id uuid NOT NULL,
  reply_to_message_id uuid NULL,
  reply_preview_text text NOT NULL DEFAULT '',
  deleted_for_everyone_at timestamptz NULL,
  content text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- 마이그레이션과 동일 조건·문구 (테이블만 격리 스키마)
CREATE OR REPLACE FUNCTION d1_atomicity_verify.cm_scrub_reply_previews_on_delete_for_everyone()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = d1_atomicity_verify, public
AS $$
BEGIN
  IF OLD.deleted_for_everyone_at IS NULL
     AND NEW.deleted_for_everyone_at IS NOT NULL THEN
    UPDATE d1_atomicity_verify.messages AS m
    SET reply_preview_text = '삭제된 메시지입니다'
    WHERE m.room_id = NEW.room_id
      AND m.reply_to_message_id = NEW.id
      AND m.reply_preview_text IS DISTINCT FROM '삭제된 메시지입니다';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER cm_messages_scrub_reply_on_delete_for_everyone
  AFTER UPDATE OF deleted_for_everyone_at
  ON d1_atomicity_verify.messages
  FOR EACH ROW
  EXECUTE FUNCTION d1_atomicity_verify.cm_scrub_reply_previews_on_delete_for_everyone();

DO $$
DECLARE
  room_a uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  room_b uuid := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  origin uuid := '11111111-1111-1111-1111-111111111111';
  reply1 uuid := '22222222-2222-2222-2222-222222222221';
  reply2 uuid := '22222222-2222-2222-2222-222222222222';
  other_room_reply uuid := '33333333-3333-3333-3333-333333333333';
  other_origin uuid := '44444444-4444-4444-4444-444444444444';
  v_preview text;
  v_dfe timestamptz;
  v_content text;
BEGIN
  INSERT INTO d1_atomicity_verify.messages (id, room_id, content, reply_preview_text)
  VALUES (origin, room_a, 'secret-origin', '');

  INSERT INTO d1_atomicity_verify.messages (id, room_id, reply_to_message_id, reply_preview_text, content)
  VALUES
    (reply1, room_a, origin, 'secret-origin', 'r1'),
    (reply2, room_a, origin, 'secret-origin', 'r2');

  INSERT INTO d1_atomicity_verify.messages (id, room_id, content, reply_preview_text)
  VALUES (other_origin, room_b, 'other-origin', '');

  INSERT INTO d1_atomicity_verify.messages (id, room_id, reply_to_message_id, reply_preview_text, content)
  VALUES (other_room_reply, room_b, other_origin, 'other-origin', 'ob');

  -- 1) 원문 삭제 + 다수 인용 scrub 동시 성공
  UPDATE d1_atomicity_verify.messages
  SET deleted_for_everyone_at = now(), content = '', metadata = '{}'::jsonb
  WHERE id = origin AND room_id = room_a;

  SELECT reply_preview_text INTO v_preview FROM d1_atomicity_verify.messages WHERE id = reply1;
  IF v_preview IS DISTINCT FROM '삭제된 메시지입니다' THEN
    RAISE EXCEPTION 'FAIL multi-reply scrub reply1: %', v_preview;
  END IF;
  SELECT reply_preview_text INTO v_preview FROM d1_atomicity_verify.messages WHERE id = reply2;
  IF v_preview IS DISTINCT FROM '삭제된 메시지입니다' THEN
    RAISE EXCEPTION 'FAIL multi-reply scrub reply2: %', v_preview;
  END IF;

  -- 2) 다른 방 영향 없음
  SELECT reply_preview_text INTO v_preview FROM d1_atomicity_verify.messages WHERE id = other_room_reply;
  IF v_preview IS DISTINCT FROM 'other-origin' THEN
    RAISE EXCEPTION 'FAIL other-room isolation: %', v_preview;
  END IF;

  -- 3) 이미 삭제된 재호출(동일 deleted_for_everyone_at 재설정) — 트리거 조건 미충족, 상태 유지
  UPDATE d1_atomicity_verify.messages
  SET deleted_for_everyone_at = now()
  WHERE id = origin;
  SELECT reply_preview_text INTO v_preview FROM d1_atomicity_verify.messages WHERE id = reply1;
  IF v_preview IS DISTINCT FROM '삭제된 메시지입니다' THEN
    RAISE EXCEPTION 'FAIL already-deleted reentry: %', v_preview;
  END IF;

  -- 4) 정상 content 수정 — deleted_for_everyone_at 미변경 → scrub 미실행(다른 방 프리뷰 유지)
  UPDATE d1_atomicity_verify.messages SET content = 'edited' WHERE id = other_origin;
  SELECT reply_preview_text INTO v_preview FROM d1_atomicity_verify.messages WHERE id = other_room_reply;
  IF v_preview IS DISTINCT FROM 'other-origin' THEN
    RAISE EXCEPTION 'FAIL content-edit should not scrub: %', v_preview;
  END IF;

  -- 5) 트리거 실패 시 원문 UPDATE 롤백
  CREATE OR REPLACE FUNCTION d1_atomicity_verify.cm_scrub_reply_previews_on_delete_for_everyone()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = d1_atomicity_verify, public
  AS $fn$
  BEGIN
    IF OLD.deleted_for_everyone_at IS NULL AND NEW.deleted_for_everyone_at IS NOT NULL THEN
      RAISE EXCEPTION 'forced_scrub_failure';
    END IF;
    RETURN NEW;
  END;
  $fn$;

  BEGIN
    UPDATE d1_atomicity_verify.messages
    SET deleted_for_everyone_at = now(), content = '', metadata = '{}'::jsonb
    WHERE id = other_origin AND room_id = room_b;
    RAISE EXCEPTION 'FAIL expected scrub failure to abort update';
  EXCEPTION
    WHEN others THEN
      IF SQLERRM NOT LIKE '%forced_scrub_failure%' THEN
        RAISE;
      END IF;
  END;

  SELECT deleted_for_everyone_at, content, reply_preview_text
    INTO v_dfe, v_content, v_preview
  FROM d1_atomicity_verify.messages WHERE id = other_origin;
  IF v_dfe IS NOT NULL OR v_content IS DISTINCT FROM 'edited' THEN
    RAISE EXCEPTION 'FAIL rollback origin: dfe=% content=%', v_dfe, v_content;
  END IF;
  SELECT reply_preview_text INTO v_preview FROM d1_atomicity_verify.messages WHERE id = other_room_reply;
  IF v_preview IS DISTINCT FROM 'other-origin' THEN
    RAISE EXCEPTION 'FAIL rollback reply preview: %', v_preview;
  END IF;

  RAISE NOTICE 'D1_ATOMICITY_VERIFY_PASS';
END $$;

DROP SCHEMA d1_atomicity_verify CASCADE;
