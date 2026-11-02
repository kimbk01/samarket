/**
 * OwnerMobileBottomNav mount occupancy — Support FAB / overlay clearance SSOT.
 * Independent of main BottomNav (`useBottomNavOccupiesClearance`).
 */

let occupiesClearance = false;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

/** Call when Owner bottom nav is mounted and should reserve clearance. */
export function setOwnerBottomNavOccupiesClearance(next: boolean): void {
  if (occupiesClearance === next) return;
  occupiesClearance = next;
  emit();
}

export function getOwnerBottomNavOccupiesClearance(): boolean {
  return occupiesClearance;
}

export function subscribeOwnerBottomNavOccupiesClearance(onStore: () => void): () => void {
  listeners.add(onStore);
  return () => {
    listeners.delete(onStore);
  };
}

/**
 * 탭 위에 고정 저장·취소 바를 띄운 화면 수 — 있으면 사장님 탭 스크롤 숨김을 끈다
 * (탭만 숨고 바가 떠 있으면 바 아래 빈 띠가 생김 · Owner S-A 2026-11-03).
 */
let footerAboveNavCount = 0;
const footerAboveNavListeners = new Set<() => void>();

/** 바를 탭 위에 띄우는 동안 1 증가 — 반환 함수로 해제 */
export function pushOwnerFooterAboveNav(): () => void {
  footerAboveNavCount += 1;
  for (const l of footerAboveNavListeners) l();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    footerAboveNavCount = Math.max(0, footerAboveNavCount - 1);
    for (const l of footerAboveNavListeners) l();
  };
}

export function getOwnerFooterAboveNavActive(): boolean {
  return footerAboveNavCount > 0;
}

export function subscribeOwnerFooterAboveNav(onStore: () => void): () => void {
  footerAboveNavListeners.add(onStore);
  return () => {
    footerAboveNavListeners.delete(onStore);
  };
}
