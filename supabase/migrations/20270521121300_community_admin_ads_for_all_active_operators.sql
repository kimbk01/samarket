-- Owner 결정 (커뮤니티 Admin PR #86): 홍보 권한(ads)은 모든 활성 관리 운영자에게.
-- 기본 권한(DEFAULT_PERMISSIONS_BY_ROLE.operator)에 ads 를 넣었으므로 명시 권한 행이 없는 운영자는 자동 적용된다.
-- 명시 권한 행이 있는 활성 운영자(role=admin)에게만 ads 를 추가한다 — 다른 권한은 그대로, 최고 관리자·해지 멤버십은 제외.
-- 재실행 안전 (이미 ads 가 있으면 건너뜀).
update public.admin_staff_permissions p
   set permissions = p.permissions || '["ads"]'::jsonb,
       updated_at = now()
  from public.admin_memberships m
 where m.user_id = p.user_id
   and m.status = 'active'
   and m.role = 'admin'
   and jsonb_typeof(p.permissions) = 'array'
   and not (p.permissions ? 'ads');
