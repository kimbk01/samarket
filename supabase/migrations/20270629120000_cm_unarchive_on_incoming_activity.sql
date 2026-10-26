-- D-6 (docs/audit/messenger-2026-10-26-remaining-reaudit-plan.md §1 · Owner 승인 2026-10-26):
-- 보관한 방에 새 메시지·부재중 통화가 와도 대화 목록으로 돌아오지 않던 문제.
-- 규칙(텔레그램 방식): 받는 사람이고, 알림 켜짐(is_muted 아님), 나가지 않음(left_at NULL),
-- 차단 숨김·거절 숨김 아님, 그룹 차단 아님 → 받는 사람의 보관 해제. 보낸 사람 쪽은 그대로.
-- 통화 기록은 부재중만 안 읽은 수에 넣으므로(`p_counts_as_unread`) 같은 분기에만 넣는다 → 통화는 부재중만.
--
-- 두 함수를 다시 옮겨 적지 않고 운영 현재 정의(pg_get_functiondef)의 받는 사람 갱신 문장에 한 줄만 넣는다.
-- 위치 문자열이 정확히 1번 나오지 않으면 적용을 중단한다(다른 정의 위에 잘못 덮어쓰지 않게).

DO $$
DECLARE
  v_def text;
  v_anchor text;
  v_new text;
  v_unarchive text := E',\n    is_archived = CASE\n      WHEN p.user_id <> p_sender_id\n        AND NOT coalesce(p.is_muted, false)\n        AND p.blocked_hidden_at IS NULL\n        AND p.declined_hidden_at IS NULL\n        AND NOT COALESCE(public.cm_group_is_user_banned(p_room_id, p.user_id), false)\n      THEN false\n      ELSE p.is_archived\n    END';
BEGIN
  -- 1) 텍스트 메시지 보내기
  v_def := pg_get_functiondef('public.community_messenger_send_text_message(uuid, uuid, text, text, timestamp with time zone, uuid)'::regprocedure);
  v_anchor := E'      ELSE p.last_read_message_id\n    END\n  WHERE p.room_id = p_room_id\n    AND (p.left_at IS NULL);';
  IF position('is_archived = CASE' in v_def) > 0 THEN
    RAISE NOTICE 'community_messenger_send_text_message already unarchives — skip';
  ELSE
    IF (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor) <> 1 THEN
      RAISE EXCEPTION 'D-6 anchor not found exactly once in community_messenger_send_text_message';
    END IF;
    v_new := replace(
      v_def,
      v_anchor,
      E'      ELSE p.last_read_message_id\n    END' || v_unarchive || E'\n  WHERE p.room_id = p_room_id\n    AND (p.left_at IS NULL);'
    );
    EXECUTE v_new;
  END IF;

  -- 2) 방 메시지 원자 추가(이미지·파일·통화 기록 등) — 안 읽은 수에 넣는 분기만
  v_def := pg_get_functiondef('public.dibay_append_room_message_atomic(text, uuid, text, text, uuid, text, text, text, jsonb, timestamp with time zone, boolean, text, boolean)'::regprocedure);
  v_anchor := E'        ELSE p.last_read_message_id\n      END\n    WHERE p.room_id = p_room_id\n      AND p.left_at IS NULL;\n  ELSE';
  IF position('is_archived = CASE' in v_def) > 0 THEN
    RAISE NOTICE 'dibay_append_room_message_atomic already unarchives — skip';
  ELSE
    IF (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor) <> 1 THEN
      RAISE EXCEPTION 'D-6 anchor not found exactly once in dibay_append_room_message_atomic';
    END IF;
    v_new := replace(
      v_def,
      v_anchor,
      E'        ELSE p.last_read_message_id\n      END' || replace(v_unarchive, E'\n    ', E'\n      ') || E'\n    WHERE p.room_id = p_room_id\n      AND p.left_at IS NULL;\n  ELSE'
    );
    EXECUTE v_new;
  END IF;
END
$$;
