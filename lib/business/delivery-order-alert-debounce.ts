import { playStoreOrderDeliveryAlertSound } from "@/lib/business/store-order-alert-sound";

const lastPlayByStore = new Map<string, number>();
const GAP_MS = 2800;

/** Realtime·폴링이 동시에 울릴 수 있어 짧은 간격으로 한 번만 재생 (매장별) */
export function playDeliveryOrderAlertDebounced(storeId: string | null): void {
  const n = Date.now();
  const k = storeId?.trim() ? storeId.trim() : "_";
  const last = lastPlayByStore.get(k) ?? 0;
  if (n - last < GAP_MS) return;
  lastPlayByStore.set(k, n);
  void playStoreOrderDeliveryAlertSound();
}
