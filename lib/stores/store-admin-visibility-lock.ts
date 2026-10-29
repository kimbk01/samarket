/**
 * 묶음 4 · O-04 (Owner 결정 2026-10-29) — 관리자가 숨긴 매장은 오너가 다시 켤 수 없다.
 * 컬럼: `stores.admin_visibility_locked` (+ `_at`·`_by`) — 마이그레이션 20270708140000.
 * 순수 함수 — 서버·테스트 공용, DB 접근 없음.
 */

export const STORE_ADMIN_VISIBILITY_LOCKED_ERROR = "admin_visibility_locked";

export const STORE_ADMIN_VISIBILITY_LOCK_COLUMN = "admin_visibility_locked" as const;

/**
 * 관리자 노출 변경과 같은 UPDATE 에 실을 잠금 필드.
 * 숨김(false) = 잠금 true + 시각·관리자 / 노출 켜기(true) = 잠금 해제.
 */
export function buildAdminStoreVisibilityLockPatch(
  nextVisible: boolean,
  adminUserId: string,
  nowIso: string = new Date().toISOString()
): {
  admin_visibility_locked: boolean;
  admin_visibility_locked_at: string | null;
  admin_visibility_locked_by: string | null;
} {
  if (nextVisible) {
    return {
      admin_visibility_locked: false,
      admin_visibility_locked_at: null,
      admin_visibility_locked_by: null,
    };
  }
  const by = String(adminUserId ?? "").trim();
  return {
    admin_visibility_locked: true,
    admin_visibility_locked_at: nowIso,
    admin_visibility_locked_by: by || null,
  };
}

/** 오너 is_visible 변경 — 잠금 상태에서 「켜기」만 막는다 (끄기는 허용). */
export function ownerStoreVisibilityBlockedByAdminLock(
  locked: unknown,
  nextVisible: boolean
): boolean {
  return nextVisible === true && locked === true;
}

/** 배포 순서 보호: 잠금 컬럼 마이그레이션 적용 전 select 오류 → 잠금 없음으로 처리. */
export function isStoreAdminVisibilityLockColumnMissingError(message: unknown): boolean {
  const m = String(message ?? "").toLowerCase();
  if (!m.includes(STORE_ADMIN_VISIBILITY_LOCK_COLUMN)) return false;
  return m.includes("does not exist") || m.includes("schema cache") || m.includes("could not find");
}
