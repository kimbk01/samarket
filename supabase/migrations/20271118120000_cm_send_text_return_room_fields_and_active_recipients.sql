-- P2 전달 지연 (docs/audit/messenger-chat-full-audit-ssot-design-2026-11-18.md §4 P2 · 부록 P2 B1·B8 · Owner 승인 2026-11-18)
--
-- 1) 성공 반환 3곳(정상·dedupe·unique_violation dedupe)에 'room_type'·'chat_domain'·'domain_identity' 추가.
--    값은 함수가 이미 읽은 v_room(community_messenger_rooms 행) — 추가 쿼리 0. 시그니처·반환형(jsonb) 불변.
--    현재 배포 코드는 payload.room_type/chat_domain 을 이미 읽고(없으면 null → rooms 재조회 폴백),
--    새 코드는 domain_identity 까지 읽어 방 bump 의 rooms·참가자 재조회를 없앤다. 옛 코드는 모르는 키를 무시.
-- 2) 비그룹 분기 recipient_user_ids 에서 나간 참가자(left_at IS NOT NULL) 제외(레거시: 나간 대화 알림 없음).
--    그룹 분기는 이미 left_at IS NULL. 일반 1:1 은 보내기 경로가 RPC 호출 **전에**
--    readmitLeftGeneralDirectPeerForSend 로 상대 left_at 을 지우므로(별도 요청·커밋 후) 상대는 계속 수신자다.
--    영향은 거래·주문 방 등 readmit 대상이 아닌 방에서 나간 참가자에게 notification_events 가 생기지 않는 것.
--    (같은 함수의 안 읽은 수 UPDATE 는 이미 left_at IS NULL 만 갱신 — 알림과 안 읽은 수 기준이 같아진다.)
--
-- 함수를 다시 옮겨 적지 않고 운영 현재 정의(pg_get_functiondef)를 문자열 치환한다(20270629120000 과 같은 방식).
-- 위치 문자열이 정확히 기대 횟수(3번)로 나오지 않으면 적용을 중단한다. 이미 적용된 항목은 건너뛴다(재실행 안전).
-- 롤백: 적용 직전 pg_get_functiondef 백업을 그대로 EXECUTE.

DO $$
DECLARE
  v_def text;
  v_new text;
  v_ret_anchor text := E'''room_direct_key'', to_jsonb(v_room.direct_key)';
  v_ret_new text := E'''room_direct_key'', to_jsonb(v_room.direct_key),\n    ''room_type'', to_jsonb(v_room.room_type),\n    ''chat_domain'', to_jsonb(v_room.chat_domain),\n    ''domain_identity'', to_jsonb(v_room.domain_identity)';
  v_rcp_anchor text := E'WHERE room_id = p_room_id AND user_id <> p_sender_id;';
  v_rcp_new text := E'WHERE room_id = p_room_id AND user_id <> p_sender_id AND left_at IS NULL;';
  v_changed boolean := false;
BEGIN
  v_def := pg_get_functiondef('public.community_messenger_send_text_message(uuid, uuid, text, text, timestamp with time zone, uuid)'::regprocedure);
  v_new := v_def;

  -- 1) 반환 필드
  IF position('''domain_identity'', to_jsonb(v_room.domain_identity)' in v_new) > 0 THEN
    RAISE NOTICE 'community_messenger_send_text_message already returns room fields — skip (1)';
  ELSE
    IF (length(v_new) - length(replace(v_new, v_ret_anchor, ''))) / length(v_ret_anchor) <> 3 THEN
      RAISE EXCEPTION 'P2 return anchor not found exactly 3 times in community_messenger_send_text_message';
    END IF;
    v_new := replace(v_new, v_ret_anchor, v_ret_new);
    v_changed := true;
  END IF;

  -- 2) 비그룹 수신자 left_at 필터
  IF (length(v_new) - length(replace(v_new, v_rcp_new, ''))) / length(v_rcp_new) = 3 THEN
    RAISE NOTICE 'community_messenger_send_text_message already filters left_at for direct recipients — skip (2)';
  ELSE
    IF (length(v_new) - length(replace(v_new, v_rcp_anchor, ''))) / length(v_rcp_anchor) <> 3 THEN
      RAISE EXCEPTION 'P2 recipient anchor not found exactly 3 times in community_messenger_send_text_message';
    END IF;
    v_new := replace(v_new, v_rcp_anchor, v_rcp_new);
    v_changed := true;
  END IF;

  IF v_changed THEN
    EXECUTE v_new;
  END IF;
END
$$;
