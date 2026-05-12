/**
 * `BusinessAdminShell` 모바일 운영 사이드(햄버거) 열림 ↔ `ConditionalAppShell` 의 메인 BottomNav.
 * pathname 기반 플래그만으로는 표현할 수 없는 일시 UI 상태를 단일 채널로 전달한다.
 */

let suppressed = false;
const listeners = new Set<() => void>();

export function setStoreOwnerMainBottomNavSuppressed(next: boolean): void {
  if (suppressed === next) return;
  suppressed = next;
  for (const l of listeners) l();
}

export function getStoreOwnerMainBottomNavSuppressed(): boolean {
  return suppressed;
}

export function subscribeStoreOwnerMainBottomNavSuppressed(onStore: () => void): () => void {
  listeners.add(onStore);
  return () => {
    listeners.delete(onStore);
  };
}
