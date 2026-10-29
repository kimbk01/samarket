-- 묶음 4 · O-04 (Owner 결정 2026-10-29) — 관리자가 숨긴 매장은 오너가 다시 켤 수 없다.
-- 운영 적용은 Owner 승인 후. 이 파일은 컬럼 3개만 추가한다 (데이터 변경 없음).
--
-- 쓰기 주체 (앱 코드):
--   · 관리자 set_store_visible(false) · 일괄 숨김(/api/admin/stores/bulk → 같은 함수)
--       → admin_visibility_locked = true, locked_at = now, locked_by = 관리자 user id
--   · 관리자 set_store_visible(true) · resume_store(운영 재개 = 노출 복구)
--       → admin_visibility_locked = false, locked_at/by = null
--   · 오너 PATCH /api/me/stores/[storeId] 의 is_visible=true 는 잠금 상태면 409 admin_visibility_locked
--     (오너가 끄는 것은 허용 — 잠금은 「다시 켜기」만 막는다)
--
-- 기존 행: 지금 숨겨진 매장(2026-10-29 운영 조회: legacy_test 17곳 전부 숨김)은 관리자·오너 중 누가
-- 숨겼는지 기록이 없어 잠금 false 로 시작한다 (기본값). 필요하면 관리자가 숨김을 다시 저장하면 잠긴다.
--
-- 롤백: ALTER TABLE public.stores DROP COLUMN IF EXISTS admin_visibility_locked,
--         DROP COLUMN IF EXISTS admin_visibility_locked_at, DROP COLUMN IF EXISTS admin_visibility_locked_by;
--       (앱은 컬럼이 없으면 잠금 false 로 간주 — 오너 PATCH 의 잠금 조회는 컬럼 부재 오류를 잠금 없음으로 처리)

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS admin_visibility_locked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS admin_visibility_locked_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS admin_visibility_locked_by uuid NULL;

COMMENT ON COLUMN public.stores.admin_visibility_locked IS
  'O-04: 관리자가 노출을 끈 매장 — true 이면 오너 PATCH 로 is_visible=true 불가 (409 admin_visibility_locked). 관리자 노출 켜기 시 false.';
COMMENT ON COLUMN public.stores.admin_visibility_locked_at IS 'O-04: 관리자 숨김 잠금 시각 (잠금 해제 시 null)';
COMMENT ON COLUMN public.stores.admin_visibility_locked_by IS 'O-04: 관리자 숨김 잠금을 건 관리자 user id (잠금 해제 시 null)';
