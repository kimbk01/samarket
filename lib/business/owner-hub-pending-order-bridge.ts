/**
 * 허브 Realtime INSERT — 대시보드 긴급 카드·CTA 딥링크용 최신 pending 주문 id.
 */

let latest: { storeId: string; orderId: string } | null = null;
const listeners = new Set<() => void>();

export function setOwnerHubLatestPendingOrderId(
  storeId: string,
  orderId: string | null | undefined
): void {
  const sid = storeId.trim();
  const oid = (orderId ?? "").trim();
  const next = sid && oid ? { storeId: sid, orderId: oid } : null;
  if (latest?.storeId === next?.storeId && latest?.orderId === next?.orderId) return;
  latest = next;
  for (const l of listeners) l();
}

export function peekOwnerHubLatestPendingOrderId(storeId: string): string | null {
  const sid = storeId.trim();
  if (!sid || !latest || latest.storeId !== sid) return null;
  return latest.orderId;
}

export function subscribeOwnerHubLatestPendingOrderId(onStore: () => void): () => void {
  listeners.add(onStore);
  return () => {
    listeners.delete(onStore);
  };
}

export function recordOwnerHubStoreOrderRealtimeRow(
  storeId: string,
  row: Record<string, unknown>,
  eventType: string
): void {
  const sid = storeId.trim();
  if (!sid) return;
  if (eventType === "INSERT") {
    const status = String(row.order_status ?? "").trim();
    const id = String(row.id ?? "").trim();
    if (id && status === "pending") {
      setOwnerHubLatestPendingOrderId(sid, id);
    }
    return;
  }
  if (eventType === "UPDATE") {
    const status = String(row.order_status ?? "").trim();
    const id = String(row.id ?? "").trim();
    if (!id) return;
    if (status === "pending") {
      setOwnerHubLatestPendingOrderId(sid, id);
    } else if (latest?.storeId === sid && latest.orderId === id) {
      setOwnerHubLatestPendingOrderId(sid, null);
    }
  }
}
