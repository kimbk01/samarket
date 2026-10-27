-- G3 (거래 감사 2026-10-27, TM-02 DB · TM-03)
--
-- 1) TM-02: 판매완료 구매자 user_id(sold_buyer_id) 를 anon·authenticated 직접 SELECT 에서 제외.
--    reserved_buyer_id 는 이미 컬럼 GRANT 에서 빠져 있음(20261107120000) — 같은 방식.
-- 2) TM-03: posts 공개 SELECT 정책이 USING(true) 라 관리자 숨김·작성자 삭제 글도 anon REST 로 조회됨.
--    공개 행 = moderation_state='visible' AND owner_state='none' (posts_visibility_gate 의 노출 판정과 동일),
--    작성자 본인 행은 기존처럼 조회 가능 (다른 테이블 정책의 posts 하위 조회 — job_details·job_applications·price_offers — 보존).
--
-- 의존 경로 확인 (운영 pg_stat_statements, 2026-10-22 리셋 이후):
--   anon·authenticated 의 posts / posts_masked 쿼리 0회 — 앱 읽기는 service_role(RLS·컬럼 GRANT 미적용).
--   posts 는 supabase_realtime publication 에 없음 → Realtime 영향 없음.
-- 데이터 변경 없음.
--
-- 롤백:
--   BEGIN;
--   GRANT SELECT (sold_buyer_id) ON TABLE public.posts TO anon, authenticated;
--   DROP POLICY IF EXISTS posts_public_select_visible_or_owner ON public.posts;
--   CREATE POLICY posts_public_select ON public.posts FOR SELECT TO anon, authenticated USING (true);
--   CREATE POLICY posts_select ON public.posts FOR SELECT TO public USING (true);
--   COMMIT;

BEGIN;

REVOKE SELECT (sold_buyer_id) ON TABLE public.posts FROM anon, authenticated;

DROP POLICY IF EXISTS posts_public_select ON public.posts;
DROP POLICY IF EXISTS posts_select ON public.posts;
DROP POLICY IF EXISTS posts_public_select_visible_or_owner ON public.posts;

CREATE POLICY posts_public_select_visible_or_owner
  ON public.posts
  FOR SELECT
  TO anon, authenticated
  USING (
    (moderation_state = 'visible' AND owner_state = 'none')
    OR (auth.uid() IS NOT NULL AND user_id = auth.uid())
  );

COMMIT;
