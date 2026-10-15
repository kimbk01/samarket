-- Call stub dedupe: one call_stub per (room_id, metadata->>'sessionId').
--
-- Concurrent terminal writers with different stub senders bypass the per-sender
-- dibay_room_unread_idempotency key and can INSERT twice. The partial unique index makes the
-- 2nd INSERT raise unique_violation (RPC returns {ok:false,error:'unique_violation'}), which
-- appendCommunityMessengerCallStubMessage treats as "already exists → reuse".
--
-- 기존 중복 보존(삭제·수정 없음): 운영 DB 확인(2026-10-15) 결과 4개 세션에 call_stub 2행씩 존재.
-- 각 그룹의 가장 이른 행(created_at, id 순 1번째)은 제약에 포함하고, 나중 행 4개만 아래 id 목록으로
-- 부분 인덱스 predicate 에서 제외한다. 화면은 클라이언트 세션 키 병합(mergeRoomMessages)으로 1개만 표시.
-- 신규 행은 모두 제약 대상이다.
--   3cd5d2c9-…/22cdc1a8-… → 제외 6569bf84-52eb-4738-9021-9a8c71beec45
--   43ee2788-…/df29aa66-… → 제외 f8370b1f-0410-48ae-aa4b-513ba84dcc48
--   9c1bdd07-…/c4b77ba2-… → 제외 e55c235a-8808-4940-8437-a3b059600a51
--   b19e2672-…/5775e0f0-… → 제외 3dd94448-82e1-4971-aa14-1a6bd6857b16
--
-- 위 4행 외의 중복이 (다른 환경 등에서) 발견되면 인덱스를 만들지 않고 NOTICE 후 종료한다(데이터 무변경).
-- 테이블 규모(운영 약 1.9만 행)상 비동시 생성의 쓰기 잠금은 짧다.

DO $$
DECLARE
  v_dupes integer;
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'cm_messages_call_stub_session_uidx'
  ) THEN
    RAISE NOTICE 'cm_messages_call_stub_session_uidx already exists — skip';
    RETURN;
  END IF;

  SELECT count(*) INTO v_dupes
  FROM (
    SELECT m.room_id, (m.metadata->>'sessionId') AS sid
    FROM public.community_messenger_messages m
    WHERE m.message_type = 'call_stub'
      AND (m.metadata->>'sessionId') IS NOT NULL
      AND m.id <> ALL (ARRAY[
        '6569bf84-52eb-4738-9021-9a8c71beec45',
        'f8370b1f-0410-48ae-aa4b-513ba84dcc48',
        'e55c235a-8808-4940-8437-a3b059600a51',
        '3dd94448-82e1-4971-aa14-1a6bd6857b16'
      ]::uuid[])
    GROUP BY 1, 2
    HAVING count(*) > 1
  ) d;

  IF v_dupes > 0 THEN
    RAISE NOTICE 'cm_messages_call_stub_session_uidx skipped: % unexpected (room_id, sessionId) duplicate groups — no data changed', v_dupes;
    RETURN;
  END IF;

  CREATE UNIQUE INDEX cm_messages_call_stub_session_uidx
    ON public.community_messenger_messages (room_id, (metadata->>'sessionId'))
    WHERE message_type = 'call_stub'
      AND (metadata->>'sessionId') IS NOT NULL
      AND id <> ALL (ARRAY[
        '6569bf84-52eb-4738-9021-9a8c71beec45',
        'f8370b1f-0410-48ae-aa4b-513ba84dcc48',
        'e55c235a-8808-4940-8437-a3b059600a51',
        '3dd94448-82e1-4971-aa14-1a6bd6857b16'
      ]::uuid[]);
END
$$;
