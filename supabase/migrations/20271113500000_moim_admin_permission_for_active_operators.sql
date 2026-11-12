-- Owner 2026-11-12 「둘 다 적용」(모임 남은 항목 감사 docs/audit/moim-open-items-audit-2026-11-12.md §1).
-- M5 에서 기본 권한(DEFAULT_PERMISSIONS_BY_ROLE.operator·manager·master)에 moim 을 넣었으나,
-- 명시 권한 행이 있는 운영자는 저장값만 쓰므로 적용되지 않았다 (활성 운영자 2명 모임 어드민 403).
-- 선례 20270521121300_community_admin_ads_for_all_active_operators.sql 와 같은 방식:
-- 명시 권한 행이 있는 활성 운영자(role=admin)에게 moim 만 추가 — 다른 권한 그대로, 최고 관리자·해지 멤버십 제외.
-- 재실행 안전 (이미 moim 이 있으면 건너뜀). 되돌리기: permissions - 'moim'.
update public.admin_staff_permissions p
   set permissions = p.permissions || '["moim"]'::jsonb,
       updated_at = now()
  from public.admin_memberships m
 where m.user_id = p.user_id
   and m.status = 'active'
   and m.role = 'admin'
   and jsonb_typeof(p.permissions) = 'array'
   and not (p.permissions ? 'moim');
