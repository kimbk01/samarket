-- 매장 신청 v2 재감사 (2026-11-10 · Owner 「전부 수정」) — 처리 이력 표 사장님 직접 읽기 회수
--
-- 이유: 20271110180000 이 store_application_events 에 사장님 본인 매장 SELECT 정책을 주었다.
--   이 표에는 관리자 내부 메모(입점 승인 사유)와 관리자 user id(actor_id)가 있어, 사장님이 Supabase 로
--   직접 읽으면 노출된다. 앱은 서버(service_role)로만 읽고 사장님에게는 걸러서 보낸다
--   (`/api/me/stores/[storeId]/application`). → 정책·권한 회수, service_role 전용.
--
-- 바꾸지 않는 것: 표·데이터·트리거, service_role 읽기/쓰기.
-- 롤백: 20271110180000 의 정책·GRANT 블록을 다시 실행.

BEGIN;

DROP POLICY IF EXISTS store_application_events_owner_select ON public.store_application_events;
REVOKE ALL ON public.store_application_events FROM anon, authenticated;

COMMIT;
