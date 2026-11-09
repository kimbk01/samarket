-- GROUP 2-A (Owner 승인 2026-11-10) — community_posts.topic_id → community_topics FK 복구.
--
-- 원인: 20260321120000_community_feed_daangn.sql 은 `topic_id ... REFERENCES community_topics(id)` 이지만
-- 운영 테이블은 CREATE TABLE IF NOT EXISTS 로 기존 형태가 유지되어 FK 가 없었다 (운영 조회 2026-11-10: FK 는 location_id 1개).
-- 그래서 PostgREST 임베드 `community_topics ( ... )` 가 관계를 찾지 못해
-- listCommunityPostsForUser 가 요청마다 실패 쿼리 2회 + 경고 후 임베드 없이 재조회했다 (주제 이름 = 슬러그).
--
-- 사전 확인(운영, 2026-11-10): 글 166 · topic_id NULL 4(FK 영향 없음) · 없는 주제를 가리키는 글 0.
-- 삭제 규칙: NO ACTION(원 마이그레이션과 동일) — 관리자 주제 삭제 API 는 이미 글이 있으면 409 topic_has_posts 로 막는다.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.community_posts'::regclass
      AND contype = 'f'
      AND confrelid = 'public.community_topics'::regclass
  ) THEN
    ALTER TABLE public.community_posts
      ADD CONSTRAINT community_posts_topic_id_fkey
      FOREIGN KEY (topic_id) REFERENCES public.community_topics (id);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
