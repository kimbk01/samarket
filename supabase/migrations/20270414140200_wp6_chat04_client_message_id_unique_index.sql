-- WP-6 / CHAT-04 — (room_id, sender_id, client_message_id) 중복 전송 DB 불변식
--
-- 배경: text/typed RPC 모두 INSERT 전에 client_message_id dedup SELECT 를 하지만,
--   동시 2중 제출(인플라이트 2건)은 SELECT-then-INSERT 경쟁으로 중복 행이 들어갈 수
--   있다. DB 유니크 인덱스로 근본 차단한다.
--
-- 사전 점검(적용 전 수행): 중복 그룹 0 · 잉여행 0 (dup_groups=0, redundant_rows=0).
--   → CONCURRENTLY 빌드가 기존 데이터로 실패하지 않는다.
--
-- 부분 인덱스: client_message_id 가 있는 행만. sender_id NULL(system force-null)은
--   NULL distinct 로 상호 충돌하지 않음(RPC 의 sender_id IS NOT DISTINCT FROM 과 정합).
--
-- CONCURRENTLY 는 트랜잭션 밖에서만 실행 가능 → BEGIN/COMMIT 없이 단일 문장.
-- IF NOT EXISTS 로 멱등. apply-gated(WP-2 외 prod 직접 적용 금지).

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS
  uq_cm_messages_room_sender_client_message_id
  ON public.community_messenger_messages (
    room_id,
    sender_id,
    (metadata->>'client_message_id')
  )
  WHERE metadata->>'client_message_id' IS NOT NULL
    AND btrim(metadata->>'client_message_id') <> '';
