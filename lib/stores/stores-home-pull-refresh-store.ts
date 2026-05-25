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
let refreshHandler: (() => void | Promise<void>) | null = null;

function notify(): void {
  listeners.forEach((listener) => listener());
}

export const STORES_HOME_PULL_REFRESH_THRESHOLD_PX = 48;

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

export function registerStoresHomePullRefreshHandler(fn: (() => void | Promise<void>) | null): void {
  refreshHandler = fn;
}

export async function runStoresHomePullRefresh(): Promise<void> {
  if (!refreshHandler || snapshot.refreshing) return;
  patchStoresHomePullRefresh({ refreshing: true, pullPx: 0 });
  try {
    await refreshHandler();
  } finally {
    patchStoresHomePullRefresh({ refreshing: false, pullPx: 0 });
  }
}
