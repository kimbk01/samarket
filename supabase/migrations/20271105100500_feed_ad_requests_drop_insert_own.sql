-- 광고 수정 설계 2026-11-04 · FB-M06 (회원 직접 INSERT 정책 삭제 — 신청은 서버 경로(service role)만)
-- 근거: docs/audit/ads-fix-design-2026-11-04.md §3 FB-M06
-- 운영 현재(2026-11-04 pg_policies): feed_ad_requests_insert_own — INSERT · roles {authenticated} · with check (user_id = auth.uid())
--   남는 정책: feed_ad_requests_select_own(SELECT 본인) · feed_ad_requests_admin_select(SELECT 관리자) — 그대로 둔다.
-- 레포 grep(2026-11-04): from("feed_ad_requests").insert 는 app/api/me/feed-ad-requests/route.ts:409 1곳뿐이고
--   tryCreateSupabaseServiceClient(service role · RLS 우회) 로 넣는다. 브라우저 클라이언트 insert 0곳.
--   (components/admin/store-points/AdminStorePointPendingProvider.tsx 는 Realtime INSERT 구독 = 읽기 → 정책 삭제와 무관)
--
-- 롤백 SQL
--   create policy feed_ad_requests_insert_own on public.feed_ad_requests
--     for insert to authenticated with check (user_id = auth.uid());

drop policy if exists feed_ad_requests_insert_own on public.feed_ad_requests;
