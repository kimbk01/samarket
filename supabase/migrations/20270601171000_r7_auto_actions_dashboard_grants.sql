-- R7 실측 F3 — 자동 조치 승인(/admin/delivery-auto-actions) 「운영 리포트를 아직 불러올 수 없어」 배너.
-- 원인: 운영 DB 에 20260515120000_delivery_auto_actions_report_rpc.sql 이 적용되지 않아
--       admin_delivery_auto_actions_dashboard 가 없었다 (API 200 · dashboard: null).
-- 조치: 20260515120000 을 운영에 그대로 적용 (Owner 승인) + 아래 권한 보정.
--       원본은 PUBLIC 만 회수 — Supabase 기본 권한으로 anon·authenticated 에 붙는 EXECUTE 도 회수한다 (service_role 만).
-- 롤백: DROP FUNCTION IF EXISTS public.admin_delivery_auto_actions_dashboard(text, uuid, boolean, boolean, boolean, integer);

revoke all on function public.admin_delivery_auto_actions_dashboard(
  text, uuid, boolean, boolean, boolean, integer
) from anon, authenticated;
