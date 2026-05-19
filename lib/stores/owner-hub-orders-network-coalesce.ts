/**
 * 허브 Realtime·배지 갱신 — `GET …/orders` 네트워크 왕복 폭주 방지(매장당 최소 간격).
 */
const MIN_GAP_MS = 3_000;

const lastNetworkAtByStore = new Map<string, number>();
let inflight: { storeId: string; promise: Promise<void> } | null = null;

export function coalesceOwnerHubOrdersNetworkRefresh(
  storeId: string,
  run: () => Promise<void>
): Promise<void> {
  const sid = storeId.trim();
  if (!sid) return Promise.resolve();

  const now = Date.now();
  const last = lastNetworkAtByStore.get(sid) ?? 0;
  if (now - last < MIN_GAP_MS) {
    return inflight?.storeId === sid ? inflight.promise : Promise.resolve();
  }

  if (inflight?.storeId === sid) {
    return inflight.promise;
  }

  lastNetworkAtByStore.set(sid, now);
  const promise = run()
    .catch(() => {})
    .finally(() => {
      if (inflight?.storeId === sid && inflight.promise === promise) {
        inflight = null;
      }
    });
  inflight = { storeId: sid, promise };
  return promise;
}

export function resetOwnerHubOrdersNetworkCoalesce(storeId?: string): void {
  if (!storeId?.trim()) {
    lastNetworkAtByStore.clear();
    inflight = null;
    return;
  }
  const sid = storeId.trim();
  lastNetworkAtByStore.delete(sid);
  if (inflight?.storeId === sid) inflight = null;
}
