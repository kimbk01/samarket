-- 고객 문의 최종 감사 (2026-11-28) D2 · D6(메모 노출) · L14 · D5 — RLS·인덱스만. 데이터는 바꾸지 않는다.
-- 근거: docs/audit/customer-support-inquiry-final-2026-11-28/final-audit.md §2 · §6 「DB (운영 적용 승인 필요)」
-- 운영 적용 = Owner 별도 승인. 재실행 안전(IF EXISTS / IF NOT EXISTS / CREATE OR REPLACE).
--
-- ── 바꾸는 것 ───────────────────────────────────────────────────────────────
-- 1) D2 — 고객(요청자) 직접 SELECT 정책 제거: support_cases · support_messages · support_sessions
--    · 기존 `support_messages_requester_select` = PUBLIC + 본인 문의 → `deleted_at` 조건이 없어
--      로그인 토큰 + 공개 키로 `/rest/v1/support_messages?case_id=eq.<내 문의>` 를 부르면 **삭제된 어드민 답변 원문**과
--      종료 문의 글을 읽을 수 있었다(고객 API 는 삭제 글 내용을 비우고 종료 문의 내용을 돌려주지 않는다).
--    · 고객 앱은 표를 직접 읽지 않는다(2026-11-28 grep): 고객 화면은 `/api/support/**`(서버 service_role)만 쓰고,
--      고객 실시간 구독(`support-modal-case-<id>` 주제)은 화면 코드에서 이미 없어졌다. → 정책에 조건을 붙이는 것보다
--      **정책을 없애는 것**이 가장 작고 안전하다(서버 API 의 마스킹·종료 규칙이 유일한 길이 된다).
--    · `GRANT SELECT … TO authenticated` 는 남긴다 — 어드민 정책(아래 2)이 이 권한 위에서 동작한다.
--      정책이 없는 고객은 RLS 로 0행(오류 아님). Realtime postgres_changes 도 RLS 를 따르므로 고객에게는 아무 행도 가지 않는다.
-- 2) D6 — 어드민 SELECT 정책을 **support 권한 보유 어드민만**으로: support_cases · support_messages · support_sessions · support_case_events
--    · 기존 = `is_platform_admin` (모든 활성 어드민) → support 권한 없는 어드민 브라우저에도 실시간 구독으로
--      내부 메모(INTERNAL_NOTE) 본문·문의 변경이 전달됐다(어드민 화면 공통 구독 `AdminStorePointPendingProvider`).
--    · 판정 = 앱 `resolveAdminRecipientAuthority` → `authorityAllows(…, "support")` 와 같은 식:
--        활성 membership(role admin|super_admin) 그리고
--        ( super_admin  또는  admin_staff_permissions 행 없음(= 등급 기본 권한 — operator·manager·master 기본값 모두 support 포함)
--          또는  저장된 permissions(jsonb 배열)에 'support' )
--    · SECURITY DEFINER 도우미는 `internal` 스키마(공개 RPC 로 노출되지 않음 — 선례 internal.is_platform_admin).
-- 3) L14 — 5분 재생 함수 `admin_notification_replay_support_replies` 의 「지난 72시간 고객 공개 글」 조회용 부분 인덱스
--    (조건이 재생 함수 WHERE 와 같아 그대로 쓰인다). 기존 인덱스는 (case_id, created_at) 뿐.
-- 4) D5 — 고객 글 속도 제한(`checkSupportCustomerPostRate`: sender_user_id + 지난 1시간) 조회용 인덱스.
--
-- ── 바꾸지 않는 것 ─────────────────────────────────────────────────────────
-- · 쓰기 권한(service_role 만) · Realtime 주제 인가 함수(`support_can_access_support_case` · 'admin-support-queue') —
--   주제 인가를 통과해도 행 전달은 위 표 정책이 거른다.
-- · 어드민 화면이 브라우저 클라이언트로 읽는 곳(`AdminStorePointPendingProvider` 의 문의 번호 조회·실시간)은
--   support 권한 어드민에게는 그대로 보이고, 권한 없는 어드민에게는 0행이 된다(의도).
--
-- ── 되돌리기 (rollback) ────────────────────────────────────────────────────
-- BEGIN;
--   -- 1) 고객 정책 복원: 20261202170000_support_cases_ssot.sql 의 support_cases_requester_select ·
--   --    support_sessions_requester_select · support_messages_requester_select CREATE POLICY 문을 그대로 다시 실행
--   -- 2) 어드민 정책 복원:
--   DROP POLICY IF EXISTS support_cases_admin_select ON public.support_cases;
--   CREATE POLICY support_cases_admin_select ON public.support_cases FOR SELECT TO authenticated
--     USING (public.is_platform_admin(auth.uid()));
--   DROP POLICY IF EXISTS support_messages_admin_select ON public.support_messages;
--   CREATE POLICY support_messages_admin_select ON public.support_messages FOR SELECT TO authenticated
--     USING (public.is_platform_admin(auth.uid()));
--   DROP POLICY IF EXISTS support_sessions_admin_select ON public.support_sessions;
--   CREATE POLICY support_sessions_admin_select ON public.support_sessions FOR SELECT TO authenticated
--     USING (public.is_platform_admin(auth.uid()));
--   DROP POLICY IF EXISTS support_case_events_admin_select ON public.support_case_events;
--   CREATE POLICY support_case_events_admin_select ON public.support_case_events FOR SELECT TO authenticated
--     USING (public.is_platform_admin(auth.uid()));
--   DROP FUNCTION IF EXISTS internal.support_admin_has_support_permission(uuid);
--   -- 3)·4) 인덱스는 남겨도 동작 영향 없음. 지우려면:
--   DROP INDEX IF EXISTS public.idx_support_messages_customer_public_created;
--   DROP INDEX IF EXISTS public.idx_support_messages_sender_user_created;
-- COMMIT;

BEGIN;

CREATE SCHEMA IF NOT EXISTS internal;

-- ---------------------------------------------------------------------------
-- 2) support 권한 판정 도우미 (RLS 전용)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION internal.support_admin_has_support_permission(check_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT check_uid IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.admin_memberships m
      WHERE m.user_id = check_uid
        AND m.status = 'active'
        -- 앱 normalizeAdminRole 과 같게: 소문자 · master = super_admin
        AND lower(btrim(m.role)) IN ('admin', 'super_admin', 'master')
        AND (
          lower(btrim(m.role)) IN ('super_admin', 'master')
          -- 명시 권한 행 없음 = 등급 기본 권한(모든 등급 기본값에 support 포함 — lib/admin-users/admin-permissions.ts)
          OR NOT EXISTS (
            SELECT 1 FROM public.admin_staff_permissions p WHERE p.user_id = check_uid
          )
          -- 명시 권한 행 있음 = 저장값 그대로(빈 배열 = 권한 없음). 저장 형식 = jsonb 배열(20270406120000 정규화)
          OR EXISTS (
            SELECT 1
            FROM public.admin_staff_permissions p
            WHERE p.user_id = check_uid
              AND jsonb_typeof(p.permissions) = 'array'
              AND p.permissions ? 'support'
          )
        )
    );
$fn$;

REVOKE ALL ON FUNCTION internal.support_admin_has_support_permission(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION internal.support_admin_has_support_permission(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION internal.support_admin_has_support_permission(uuid) IS
  '고객 문의 최종 감사 D6 (2026-11-28): 활성 어드민 + support 권한(앱 authorityAllows(support) 와 같은 식). support_* 표 어드민 SELECT 정책 전용.';

-- ---------------------------------------------------------------------------
-- 1) 고객(요청자) 직접 SELECT 정책 제거 (D2)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS support_cases_requester_select ON public.support_cases;
DROP POLICY IF EXISTS support_messages_requester_select ON public.support_messages;
DROP POLICY IF EXISTS support_sessions_requester_select ON public.support_sessions;

-- ---------------------------------------------------------------------------
-- 2) 어드민 SELECT 정책 = support 권한 어드민만 (D6)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS support_cases_admin_select ON public.support_cases;
CREATE POLICY support_cases_admin_select
  ON public.support_cases
  FOR SELECT
  TO authenticated
  USING (internal.support_admin_has_support_permission(auth.uid()));

DROP POLICY IF EXISTS support_messages_admin_select ON public.support_messages;
CREATE POLICY support_messages_admin_select
  ON public.support_messages
  FOR SELECT
  TO authenticated
  USING (internal.support_admin_has_support_permission(auth.uid()));

DROP POLICY IF EXISTS support_sessions_admin_select ON public.support_sessions;
CREATE POLICY support_sessions_admin_select
  ON public.support_sessions
  FOR SELECT
  TO authenticated
  USING (internal.support_admin_has_support_permission(auth.uid()));

-- 사건 기록에는 수정 전 답변 원문(message_edited.previous_body)이 있다 → 같은 기준
DROP POLICY IF EXISTS support_case_events_admin_select ON public.support_case_events;
CREATE POLICY support_case_events_admin_select
  ON public.support_case_events
  FOR SELECT
  TO authenticated
  USING (internal.support_admin_has_support_permission(auth.uid()));

-- ---------------------------------------------------------------------------
-- 3) 재생 함수용 부분 인덱스 (L14) — WHERE 가 admin_notification_replay_support_replies 와 같다
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_support_messages_customer_public_created
  ON public.support_messages (created_at)
  WHERE message_type = 'PUBLIC'
    AND sender_type IN ('MEMBER', 'OWNER')
    AND deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- 4) 고객 글 속도 제한 조회용 (D5)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_support_messages_sender_user_created
  ON public.support_messages (sender_user_id, created_at DESC)
  WHERE sender_user_id IS NOT NULL;

COMMIT;
