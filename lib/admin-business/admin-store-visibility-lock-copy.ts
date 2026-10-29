/**
 * v4 UI-04 — 관리자 노출 변경 확인창 설명 (O-04 관리자 숨김 잠금).
 * 관리자 숨김 = 잠금(오너가 다시 켤 수 없음) · 관리자 노출 켜기 = 잠금 해제.
 */
export function adminStoreVisibilityLockConfirmCopy(nextVisible: boolean, ko: boolean): string {
  if (nextVisible) {
    return ko
      ? "노출을 켜면 관리자 숨김 잠금도 풀려 사장님이 다시 노출을 직접 끄고 켤 수 있습니다."
      : "Turning visibility on also clears the admin hide lock, so the owner can toggle visibility again.";
  }
  return ko
    ? "관리자가 숨긴 매장은 잠금 상태가 되어 사장님이 다시 켤 수 없습니다. 다시 노출하려면 관리자가 노출을 켜야 합니다."
    : "A store hidden by an admin is locked: the owner cannot turn it back on. Only an admin can show it again.";
}
