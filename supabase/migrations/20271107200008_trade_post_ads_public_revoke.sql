-- D-21 (ads-reaudit3-defect-design-2026-11-07) — 레거시 trade_post_ads 공개 읽기 닫기.
--
-- 운영 확인(2026-11-07 SELECT):
--   · RLS 켜짐 · 정책 2개: trade_post_ads_select_active_window(SELECT · public · 기간 안 active 행 누구나)
--     · trade_post_ads_select_own(SELECT · public · user_id = auth.uid()).
--   · 권한: anon·authenticated 모두 SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER · 행 0개.
--   · 노출 칸: point_cost·priority·admin_memo·user_id·기간.
--   · 앱 사용처(grep): app/api/posts/[postId]/trade-ads/{apply,products}/route.ts · app/api/admin/trade-post-ads/** —
--     모두 tryCreateSupabaseServiceClient(service_role). "use client" 파일에서 읽는 곳 0.
-- 처리(설계대로): 공개 정책 삭제 · anon 권한 전부 회수 · authenticated SELECT 회수. 본인 정책은 남긴다(정의 보존).
--
-- 롤백 SQL:
--   create policy trade_post_ads_select_active_window on public.trade_post_ads for select to public
--     using ((apply_status = 'active') and (start_at is not null) and (end_at is not null) and (now() >= start_at) and (now() <= end_at));
--   grant select, insert, update, delete, truncate, references, trigger on public.trade_post_ads to anon;
--   grant select on public.trade_post_ads to authenticated;

drop policy if exists trade_post_ads_select_active_window on public.trade_post_ads;
revoke all on table public.trade_post_ads from anon;
revoke select on table public.trade_post_ads from authenticated;
