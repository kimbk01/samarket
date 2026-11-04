-- 광고 수정 설계 보완 2026-11-04 · PV-2 (S-2 · 광고 표 공개 SELECT 정책 삭제 + anon 권한 회수)
-- 근거: docs/audit/ads-fix-design-supplement-2026-11-04.md §2-3 PV-2 (묶음 B · 별도 승인)
-- 운영 현재(2026-11-04 pg_policies · role_table_grants):
--   feed_ad_campaigns       : feed_ad_campaigns_select_active        SELECT {anon,authenticated} — 다른 정책 없음
--   feed_ad_creatives       : feed_ad_creatives_select_active        SELECT {anon,authenticated} — 다른 정책 없음
--   store_banner_ad_campaigns: store_banner_ad_campaigns_select_active SELECT {anon,authenticated} — 다른 정책 없음
--   delivery_ad_creatives   : delivery_ad_creatives_select_approved  SELECT {anon,authenticated} — 다른 정책 없음
--   네 표 모두 RLS 켜짐 · anon/authenticated 에 INSERT·SELECT·UPDATE·DELETE·TRUNCATE·REFERENCES·TRIGGER 전부 부여돼 있음.
-- 소유자·관리자 SELECT 정책이 네 표 모두 없다 → authenticated SELECT 회수 (정책 삭제 뒤에는 어차피 0행).
--   예외: store_banner_ad_campaigns 는 authenticated SELECT 권한을 남긴다 — 다른 표의 정책
--   delivery_ad_campaign_commercial_snapshots_select · delivery_ad_extension_snapshots_select 가 authenticated 로 이 표를
--   하위 조회한다. 권한을 회수하면 그 두 표 조회가 「permission denied」 오류가 된다(정책 없음 → 0행으로 두는 쪽이 안전).
-- 앱 경로(2026-11-04 레포 grep): 네 표를 읽는 곳은 모두 서버 파일이고 service role 클라이언트
--   (tryCreateSupabaseServiceClient · tryGetSupabaseForStores = SUPABASE_SERVICE_ROLE_KEY) 를 쓴다.
--   "use client" 파일에서 네 표 직접 조회 0 · Realtime 구독 0. 이 표를 보는 뷰 0 · invoker 함수는 트리거 2개뿐(쓰기 경로 = service role).
--
-- 롤백 SQL
--   grant select, insert, update, delete, truncate, references, trigger on public.feed_ad_campaigns, public.feed_ad_creatives,
--     public.store_banner_ad_campaigns, public.delivery_ad_creatives to anon;
--   grant select on public.feed_ad_campaigns, public.feed_ad_creatives, public.delivery_ad_creatives to authenticated;
--   create policy feed_ad_campaigns_select_active on public.feed_ad_campaigns for select to anon, authenticated
--     using ((status = 'active') and ((start_at is null) or (start_at <= now())) and ((end_at is null) or (end_at >= now())));
--   create policy feed_ad_creatives_select_active on public.feed_ad_creatives for select to anon, authenticated
--     using ((is_active = true) and exists (select 1 from public.feed_ad_campaigns c where c.id = feed_ad_creatives.campaign_id
--       and c.status = 'active' and (c.start_at is null or c.start_at <= now()) and (c.end_at is null or c.end_at >= now())));
--   create policy store_banner_ad_campaigns_select_active on public.store_banner_ad_campaigns for select to anon, authenticated
--     using ((is_active = true) and (start_at <= now()) and (end_at > now()) and (length(trim(both from image_url)) > 0));
--   create policy delivery_ad_creatives_select_approved on public.delivery_ad_creatives for select to anon, authenticated
--     using ((review_status = 'APPROVED') and (archived_at is null));

drop policy if exists feed_ad_campaigns_select_active on public.feed_ad_campaigns;
drop policy if exists feed_ad_creatives_select_active on public.feed_ad_creatives;
drop policy if exists store_banner_ad_campaigns_select_active on public.store_banner_ad_campaigns;
drop policy if exists delivery_ad_creatives_select_approved on public.delivery_ad_creatives;

revoke all on table public.feed_ad_campaigns from anon;
revoke all on table public.feed_ad_creatives from anon;
revoke all on table public.store_banner_ad_campaigns from anon;
revoke all on table public.delivery_ad_creatives from anon;

revoke select on table public.feed_ad_campaigns from authenticated;
revoke select on table public.feed_ad_creatives from authenticated;
-- store_banner_ad_campaigns: authenticated SELECT 유지 (위 예외 · RLS 정책 0 → 0행)
revoke select on table public.delivery_ad_creatives from authenticated;
