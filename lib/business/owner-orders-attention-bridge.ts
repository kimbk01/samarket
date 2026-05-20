/**
 * `/stores/owner/orders` — 목록·RT가 이미 갖는 KPI를 `BusinessAdminShell` 헤더 배지에 전달.
 * `fetchStoreOrderCountsDeduped` 45s 폴링과 이중 왕복을 막는다.
 */

let override: { storeId: string; badge: number } | null = null;
const listeners = new Set<() => void>();

export function setOwnerOrdersAttentionBridge(
  storeId: string | null,
  badge: number | null
): void {
  const sid = storeId?.trim() ?? "";
  const next =
    sid && badge != null && Number.isFinite(badge)
      ? { storeId: sid, badge: Math.max(0, Math.floor(badge)) }
      : null;
  if (
    override?.storeId === next?.storeId &&
    override?.badge === next?.badge
  ) {
    return;
  }
  override = next;
  for (const l of listeners) l();
}

export function peekOwnerOrdersAttentionBridge(storeId: string): number | null {
  const sid = storeId.trim();
  if (!sid || !override || override.storeId !== sid) return null;
  return override.badge;
}

export function subscribeOwnerOrdersAttentionBridge(onStore: () => void): () => void {
  listeners.add(onStore);
  return () => {
    listeners.delete(onStore);
  };
}
