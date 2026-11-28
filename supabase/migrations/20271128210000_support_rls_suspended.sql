-- 고객 문의 최종 점검 L7 (2026-11-28) — RLS 도우미 internal.support_admin_has_support_permission 이
-- 정지(suspended) 운영자도 support 권한으로 판정하던 것을 앱과 같게 막는다. 운영 적용 = Owner 별도 승인(아직 적용 안 함).
--
-- 앱 기준 (lib/admin/require-admin-api.ts `isSuspendedNonSuperAdminActor` · lib/auth/member-account-state.ts `isSuspendedMemberAccount`):
--   profiles.status 를 소문자·공백 제거해 'suspended' 이면 관리자 경로 차단 — 단 최고관리자(super_admin · master)는 제외(잠김 방지).
-- 그 밖의 판정(활성 membership · 역할 · 명시 권한 행)은 20271128200000 정의 그대로. CREATE OR REPLACE 만(정책·권한 변경 없음).
--
-- 되돌리기: 20271128200000_support_final_audit.sql 의 같은 함수 정의를 다시 CREATE OR REPLACE.

BEGIN;

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
        -- L7: 정지 운영자 차단 — 최고관리자는 제외(앱 isSuspendedNonSuperAdminActor 와 같은 식)
        AND (
          lower(btrim(m.role)) IN ('super_admin', 'master')
          OR NOT EXISTS (
            SELECT 1
            FROM public.profiles pr
            WHERE pr.id = check_uid
              AND lower(btrim(coalesce(pr.status, ''))) = 'suspended'
          )
        )
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

COMMENT ON FUNCTION internal.support_admin_has_support_permission(uuid) IS
  '고객 문의 최종 감사 D6 (2026-11-28) · 최종 점검 L7: 활성 어드민 + support 권한 + 정지 아님(최고관리자 제외) — 앱 requireAdminPermission(support) 와 같은 식. support_* 표 어드민 SELECT 정책 전용.';

COMMIT;
