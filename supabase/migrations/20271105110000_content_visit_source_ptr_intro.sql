-- 광고 표면 전체 SSOT 2026-11-04 · CX-03 (콘텐츠 방문 출처에 PTR·INTRO 추가)
-- 근거: docs/dibay-ads-surface-master-ssot.md §2-3 · lib/platform-promotion-lifecycle/content-visit-contract.ts
-- 운영 현재(2026-11-04 pg_constraint): CHECK (source_channel = ANY (ARRAY['POPUP','BANNER','PUSH','BELL']))
-- 바꾸는 것: PTR 띠 클릭(지금까지 BANNER 로 섞여 기록)과 인트로 CTA 이벤트 이동을 각자 출처로 기록할 수 있게 넓힌다.
-- 기존 행은 그대로(모두 4종 안).
--
-- 롤백 SQL
--   alter table public.platform_promotion_content_visits drop constraint if exists platform_promotion_content_visits_source_channel_check;
--   alter table public.platform_promotion_content_visits add constraint platform_promotion_content_visits_source_channel_check
--     check (source_channel = any (array['POPUP','BANNER','PUSH','BELL']));
--   (롤백 전 PTR·INTRO 행이 있으면 실패한다 — 그때는 해당 행을 BANNER 로 바꾸는 별도 승인 필요)

alter table public.platform_promotion_content_visits
  drop constraint if exists platform_promotion_content_visits_source_channel_check;
alter table public.platform_promotion_content_visits
  add constraint platform_promotion_content_visits_source_channel_check
  check (source_channel = any (array['POPUP', 'BANNER', 'PUSH', 'BELL', 'PTR', 'INTRO']));
