/**
 * Parse unified owner dashboard notifications snapshot RPC payload.
 */
export type OwnerDashboardNotificationsSnapshotPayloadJson = {
  /** owner_store_commerce = 그 회원의 모든 매장 · owner_store = p_store_id 매장만 (20271102100000 부터). */
  unread_counts?: { owner_store_commerce?: number; owner_store?: number };
  notifications?: unknown[];
  latest_orders?: unknown[];
  latest_inquiries?: unknown[];
  latest_messages?: unknown[];
  preview_summaries?: unknown[];
  store_id?: string | null;
  cursor?: string;
  updated_at?: string;
};

export function parseOwnerDashboardNotificationsSnapshotRpcData(
  data: unknown
): OwnerDashboardNotificationsSnapshotPayloadJson | null {
  if (!data || typeof data !== "object") return null;
  return data as OwnerDashboardNotificationsSnapshotPayloadJson;
}

export function ownerStoreCommerceUnreadFromPayload(
  payload: OwnerDashboardNotificationsSnapshotPayloadJson
): number {
  return Math.max(0, Math.floor(Number(payload.unread_counts?.owner_store_commerce) || 0));
}

/**
 * 매장 종 숫자(C4) — 그 매장 오너 알림 미읽음. RPC 가 매장 단위 숫자(`owner_store`)를 주면 그 값,
 * 그 전 버전 RPC 는 같은 페이로드의 매장 목록(최신 200건)에서 센다.
 */
export function ownerStoreUnreadFromPayload(payload: OwnerDashboardNotificationsSnapshotPayloadJson): number {
  const fromServer = payload.unread_counts?.owner_store;
  if (typeof fromServer === "number" && Number.isFinite(fromServer)) return Math.max(0, Math.floor(fromServer));
  return ownerStoreNotificationsFromPayload(payload).filter((n) => n.is_read !== true).length;
}

export function ownerStoreNotificationsFromPayload(
  payload: OwnerDashboardNotificationsSnapshotPayloadJson
): Record<string, unknown>[] {
  return Array.isArray(payload.notifications)
    ? (payload.notifications as Record<string, unknown>[])
    : [];
}
