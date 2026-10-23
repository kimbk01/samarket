-- §2 묶음 2 D-1: 전원 삭제 UPDATE 와 같은 트랜잭션에서 인용 reply_preview scrub
-- Owner 승인: 트리거 방식 · 운영 적용은 별도 · 백필 없음

CREATE OR REPLACE FUNCTION public.cm_scrub_reply_previews_on_delete_for_everyone()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- NULL → 값 전환만 (이미 삭제된 행 재 UPDATE / 일반 content 수정은 스킵)
  IF OLD.deleted_for_everyone_at IS NULL
     AND NEW.deleted_for_everyone_at IS NOT NULL THEN
    UPDATE public.community_messenger_messages AS m
    SET reply_preview_text = '삭제된 메시지입니다'
    WHERE m.room_id = NEW.room_id
      AND m.reply_to_message_id = NEW.id
      AND m.reply_preview_text IS DISTINCT FROM '삭제된 메시지입니다';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.cm_scrub_reply_previews_on_delete_for_everyone() IS
  'D-1: when deleted_for_everyone_at is first set, scrub same-room reply_preview_text snapshots in the same transaction.';

-- UPDATE OF deleted_for_everyone_at 만 대상 → scrub이 reply_preview_text만 바꾸면 재진입 없음
DROP TRIGGER IF EXISTS cm_messages_scrub_reply_on_delete_for_everyone
  ON public.community_messenger_messages;

CREATE TRIGGER cm_messages_scrub_reply_on_delete_for_everyone
  AFTER UPDATE OF deleted_for_everyone_at
  ON public.community_messenger_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.cm_scrub_reply_previews_on_delete_for_everyone();

REVOKE ALL ON FUNCTION public.cm_scrub_reply_previews_on_delete_for_everyone() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cm_scrub_reply_previews_on_delete_for_everyone() FROM anon;
REVOKE ALL ON FUNCTION public.cm_scrub_reply_previews_on_delete_for_everyone() FROM authenticated;
-- 트리거 호출만 사용. 클라이언트 직접 EXECUTE 확대하지 않음.
GRANT EXECUTE ON FUNCTION public.cm_scrub_reply_previews_on_delete_for_everyone() TO postgres;
GRANT EXECUTE ON FUNCTION public.cm_scrub_reply_previews_on_delete_for_everyone() TO service_role;
