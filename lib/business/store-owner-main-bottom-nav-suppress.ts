/**
 * `BusinessAdminShell` 일시 UI(햄버거·주문 상세) ↔ `ConditionalAppShell` 메인 BottomNav.
 * pathname 만으로 표현할 수 없는 상태를 단일 채널로 전달한다.
 */

let suppressCount = 0;
const listeners = new Set<() => void>();

function notifySuppressListeners(): void {
  for (const l of listeners) l();
}

/** @deprecated 단일 소스는 `pushStoreOwnerMainBottomNavSuppressed` — 드로어·상세 동시 열림 대비 */
export function setStoreOwnerMainBottomNavSuppressed(next: boolean): void {
  const target = next ? 1 : 0;
  if (suppressCount === target) return;
  suppressCount = target;
  notifySuppressListeners();
}

/** 사유별로 누적 — 언마운트 시 `pop` 으로 다른 사유가 남아 있으면 suppress 유지 */
export function pushStoreOwnerMainBottomNavSuppressed(): () => void {
  suppressCount += 1;
  notifySuppressListeners();
  return () => {
    suppressCount = Math.max(0, suppressCount - 1);
    notifySuppressListeners();
  };
}

export function getStoreOwnerMainBottomNavSuppressed(): boolean {
  return suppressCount > 0;
}

export function subscribeStoreOwnerMainBottomNavSuppressed(onStore: () => void): () => void {
  listeners.add(onStore);
  return () => {
    listeners.delete(onStore);
  };
}
