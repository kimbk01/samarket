/**
 * Parse unified owner dashboard notifications snapshot RPC payload.
 */
export type OwnerDashboardNotificationsSnapshotPayloadJson = {
  unread_counts?: { owner_store_commerce?: number };
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

export function ownerStoreNotificationsFromPayload(
  payload: OwnerDashboardNotificationsSnapshotPayloadJson
): Record<string, unknown>[] {
  return Array.isArray(payload.notifications)
    ? (payload.notifications as Record<string, unknown>[])
    : [];
}
