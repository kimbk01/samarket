"use client";

export type StoresHomePullRefreshSnapshot = {
  pullPx: number;
  refreshing: boolean;
};

const EMPTY: StoresHomePullRefreshSnapshot = {
  pullPx: 0,
  refreshing: false,
};

let snapshot: StoresHomePullRefreshSnapshot = EMPTY;
const listeners = new Set<() => void>();
const refreshHandlers = new Set<() => void | Promise<void>>();

/** 손가락 놓음 임계 — `pullPx` 스케일(touch dy×damping). 기존 48px 대비 +20% */
export const STORES_HOME_PULL_REFRESH_THRESHOLD_PX = 58;
/** 헤더 확장 상한 — 기존 88px 대비 +20% */
export const STORES_HOME_PULL_REFRESH_MAX_PX = 106;
/** 새로고침 중 헤더 hint 슬롯(당김 높이 유지 → 스피너) */
export const STORES_HOME_PULL_REFRESH_SLOT_PX = 52;
/** 당김 hint 최소 표시 */
export const STORES_HOME_PULL_REFRESH_HINT_MIN_PX = 14;
/** 새로고침 스피너 최소 노출(ms) — PTR 체감 */
export const STORES_HOME_PULL_REFRESH_MIN_SPIN_MS = 450;
/** hint 영역 height·opacity 전환(ms) — 복귀 시 ease-out */
export const STORES_HOME_PULL_REFRESH_COLLAPSE_MS = 320;

/** touch dy → 헤더 pullPx (러버밴드 — 상한 근처에서 덜 끈김) */
export function computeStoresHomePullPxFromTouchDy(dy: number): number {
  if (dy <= 0) return 0;
  const linear = dy * 0.48;
  const max = STORES_HOME_PULL_REFRESH_MAX_PX;
  return Math.min(max, max * (1 - Math.exp(-linear / (max * 0.62))));
}

export function resolveStoresHomePullRefreshSlotPx(releasePullPx: number): number {
  return Math.min(
    STORES_HOME_PULL_REFRESH_MAX_PX,
    Math.max(releasePullPx, STORES_HOME_PULL_REFRESH_THRESHOLD_PX, STORES_HOME_PULL_REFRESH_SLOT_PX)
  );
}

export function resolveStoresHomePullHintHeightPx(snap: StoresHomePullRefreshSnapshot): number {
  if (snap.refreshing) return snap.pullPx;
  return snap.pullPx > 2 ? snap.pullPx : 0;
}

function notify(): void {
  listeners.forEach((listener) => listener());
}

export function subscribeStoresHomePullRefresh(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getStoresHomePullRefreshSnapshot(): StoresHomePullRefreshSnapshot {
  return snapshot;
}

export function getStoresHomePullRefreshServerSnapshot(): StoresHomePullRefreshSnapshot {
  return EMPTY;
}

export function patchStoresHomePullRefresh(patch: Partial<StoresHomePullRefreshSnapshot>): void {
  const next = { ...snapshot, ...patch };
  if (next.pullPx === snapshot.pullPx && next.refreshing === snapshot.refreshing) return;
  snapshot = next;
  notify();
}

/** @deprecated 단일 슬롯 — `addStoresHomePullRefreshHandler` 사용 */
export function registerStoresHomePullRefreshHandler(fn: (() => void | Promise<void>) | null): void {
  refreshHandlers.clear();
  if (fn) refreshHandlers.add(fn);
}

export function addStoresHomePullRefreshHandler(fn: () => void | Promise<void>): () => void {
  refreshHandlers.add(fn);
  return () => {
    refreshHandlers.delete(fn);
  };
}

export async function runStoresHomePullRefresh(releasePullPx = 0): Promise<void> {
  if (refreshHandlers.size === 0 || snapshot.refreshing) return;
  const slotPx = resolveStoresHomePullRefreshSlotPx(releasePullPx);
  patchStoresHomePullRefresh({ refreshing: true, pullPx: slotPx });
  const startedAt = performance.now();
  try {
    await Promise.all([...refreshHandlers].map((handler) => Promise.resolve(handler())));
  } finally {
    const waitMs = STORES_HOME_PULL_REFRESH_MIN_SPIN_MS - (performance.now() - startedAt);
    if (waitMs > 0) {
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, waitMs);
      });
    }
    patchStoresHomePullRefresh({ refreshing: false, pullPx: slotPx });
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
    patchStoresHomePullRefresh({ refreshing: false, pullPx: 0 });
  }
}
