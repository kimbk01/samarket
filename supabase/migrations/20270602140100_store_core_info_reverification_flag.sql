-- 배달 오너 감사 ND-2 (Owner 결정 2026-10-20 · 문서 G-1 §0-2 / ACC-06 연관) — 승인 매장 핵심 위치 변경 재검증 표시
-- 정책: 승인(approved) 매장에서 오너가 주소(region/city/district/address_line1/address_line2)·좌표(lat/lng)를 바꾸면
--       즉시 반영(영업 중단 없음) + 관리자 재검증 표시 + 감사 기록 + 관리자 알림. 관리자 「재검증 완료」로 해제.
--       표시 쓰기는 오너 PATCH(app/api/me/stores/[storeId]/route.ts, 같은 UPDATE 문)·해제는 관리자 PATCH
--       (action confirm_core_info_reverified, 상태 CAS) — 둘 다 service_role 서버 API. stores 는 P0 거부 트리거로 클라 직접 쓰기 불가.
-- 기존 행: 상수 DEFAULT 'none' 로 메타데이터만 추가(테이블 재작성 없음) — 과거 값 변경 없음 (D-5).
-- 롤백:
--   ALTER TABLE public.stores DROP CONSTRAINT IF EXISTS stores_core_info_review_status_check;
--   ALTER TABLE public.stores DROP CONSTRAINT IF EXISTS stores_core_info_pending_has_changed_at;
--   ALTER TABLE public.stores DROP COLUMN IF EXISTS core_info_review_status, DROP COLUMN IF EXISTS core_info_changed_at,
--     DROP COLUMN IF EXISTS core_info_changed_fields, DROP COLUMN IF EXISTS core_info_verified_at,
--     DROP COLUMN IF EXISTS core_info_verified_by;
--   (웹은 컬럼 부재 시 플래그 없이 저장하도록 되어 있어 롤백 순서 무관)

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS core_info_review_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS core_info_changed_at timestamptz,
  ADD COLUMN IF NOT EXISTS core_info_changed_fields text[],
  ADD COLUMN IF NOT EXISTS core_info_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS core_info_verified_by uuid;

ALTER TABLE public.stores DROP CONSTRAINT IF EXISTS stores_core_info_review_status_check;
ALTER TABLE public.stores
  ADD CONSTRAINT stores_core_info_review_status_check
  CHECK (core_info_review_status IN ('none', 'pending_reverification'));

ALTER TABLE public.stores DROP CONSTRAINT IF EXISTS stores_core_info_pending_has_changed_at;
ALTER TABLE public.stores
  ADD CONSTRAINT stores_core_info_pending_has_changed_at
  CHECK (core_info_review_status <> 'pending_reverification' OR core_info_changed_at IS NOT NULL);

COMMENT ON COLUMN public.stores.core_info_review_status IS
  'ND-2: none | pending_reverification (approved store owner changed address/lat/lng; admin must re-verify)';
COMMENT ON COLUMN public.stores.core_info_changed_at IS 'ND-2: last owner core location change time (UTC)';
COMMENT ON COLUMN public.stores.core_info_changed_fields IS 'ND-2: core location fields changed by the owner';
COMMENT ON COLUMN public.stores.core_info_verified_at IS 'ND-2: last admin re-verification time (UTC)';
COMMENT ON COLUMN public.stores.core_info_verified_by IS 'ND-2: admin user id that cleared the re-verification flag';
