-- 운영(ckdosyydvgzqwpbwuhon) 20271128210000 적용 전 함수 정의 — 2026-11-28 PHT 조회(pg_get_functiondef). 되돌리기 = 이 정의로 CREATE OR REPLACE.
CREATE OR REPLACE FUNCTION internal.support_admin_has_support_permission(check_uid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT check_uid IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.admin_memberships m
      WHERE m.user_id = check_uid
        AND m.status = 'active'
        AND lower(btrim(m.role)) IN ('admin', 'super_admin', 'master')
        AND (
          lower(btrim(m.role)) IN ('super_admin', 'master')
          OR NOT EXISTS (
            SELECT 1 FROM public.admin_staff_permissions p WHERE p.user_id = check_uid
          )
          OR EXISTS (
            SELECT 1
            FROM public.admin_staff_permissions p
            WHERE p.user_id = check_uid
              AND jsonb_typeof(p.permissions) = 'array'
              AND p.permissions ? 'support'
          )
        )
    );
$function$;
