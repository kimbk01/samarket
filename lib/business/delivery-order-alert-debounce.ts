const lastPlayByStore = new Map<string, number>();
const GAP_MS = 2800;
const LAST_PLAY_STALE_MS = 3_600_000;
const LAST_PLAY_MAX_STORE_KEYS = 200;

function capLastPlayByStore(now: number): void {
  for (const [k, t] of lastPlayByStore) {
    if (now - t > LAST_PLAY_STALE_MS) lastPlayByStore.delete(k);
  }
  while (lastPlayByStore.size > LAST_PLAY_MAX_STORE_KEYS) {
    const k = lastPlayByStore.keys().next().value;
    if (k === undefined) break;
    lastPlayByStore.delete(k);
  }
}

/**
 * store_orders Realtime/polling은 badge·list refresh만 담당한다.
 * 신규 주문 sound 권위는 notification_events INSERT → Admin SSOT gate 한 갈래다.
 */
export function playDeliveryOrderAlertDebounced(storeId: string | null): void {
  const n = Date.now();
  const k = storeId?.trim() ? storeId.trim() : "_";
  const last = lastPlayByStore.get(k) ?? 0;
  if (n - last < GAP_MS) return;
  lastPlayByStore.set(k, n);
  capLastPlayByStore(n);
}
