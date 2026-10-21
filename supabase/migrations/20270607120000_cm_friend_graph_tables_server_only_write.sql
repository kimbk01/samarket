-- 메신저 감사 F-12 (docs/dibay-messenger-full-audit-2026-10-21.md 2부 H-1) — 친구·숨김·즐겨찾기 테이블 서버 전용 쓰기
-- 운영 확인(2026-10-21, prod ckdosyydvgzqwpbwuhon 읽기 전용):
--   user_social_relations · user_relationships · community_friend_favorites 에 anon·authenticated 가
--   INSERT/UPDATE/DELETE/TRUNCATE 권한 보유 → 서버 차단 검사(addFriendSaved)를 거치지 않는 직접 쓰기 가능.
-- 안전성: 앱 쓰기는 전부 service_role 경로(app/api/**, lib/**/service·social-relations), 브라우저 직접 쓰기 0건(grep 확인).
--   SELECT 권한·RLS 정책은 그대로 → 조회·Realtime(postgres_changes) 불변. 정책 미변경 → 롤백 = GRANT 재부여.
-- 운영 적용: Owner 별도 명시 승인 후(D6).
BEGIN;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.user_social_relations FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.user_relationships FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.community_friend_favorites FROM anon, authenticated;
COMMIT;

-- 롤백(필요 시):
-- GRANT INSERT, UPDATE, DELETE ON public.user_social_relations, public.user_relationships,
--   public.community_friend_favorites TO authenticated;
