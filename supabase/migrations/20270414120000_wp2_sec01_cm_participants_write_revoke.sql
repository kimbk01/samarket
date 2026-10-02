-- WP-2 / SEC-01 — community_messenger_participants 서버 전용 쓰기 전환
-- 재감사(2026-10-02, prod ckdosyydvgzqwpbwuhon): anon·authenticated 가 전체 쓰기 권한 보유.
--   participants INSERT 정책이 auth.uid()=user_id 만 보고 가드 트리거는 role 만 막아,
--   방 UUID 만 알면 임의 사용자가 참가자 행 생성 가능(SEC-01).
-- 안전성: 앱 참가자 쓰기는 전부 service_role 경로, 브라우저(anon) 직접 쓰기 0건.
--   authenticated SELECT 권한/정책 유지 → 조회·Realtime 불변. (정책 미변경 → 롤백 단순)
BEGIN;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.community_messenger_participants FROM anon, authenticated;
COMMIT;
