/**
 * Phase B — single mutation invalidation for owner delivery surfaces.
 * Clears counts + list memory once, schedules OOL1 refresh once (no double schedule / counter delete race).
 */
import { invalidateOwnerStoreOrdersListCache } from "@/lib/delivery/owner/owner-store-orders-list-cache";
import { scheduleOwnerStoreOrdersListSnapshotRefresh } from "@/lib/delivery/owner/owner-store-orders-list-snapshot-refresh";
import { invalidateStoreOrderCountsCache } from "@/lib/stores/store-order-counts-cache";

export function invalidateOwnerDeliverySurfacesAfterMutation(
  storeId: string,
  ownerUserId: string,
  logOpts?: {
    route?: string;
    orderId?: string;
    reason?: string;
    afterMutationSuccess?: boolean;
  }
): void {
  const sid = storeId.trim();
  const uid = ownerUserId.trim();
  if (!sid || !uid) return;

  invalidateStoreOrderCountsCache(sid, uid, { scheduleListRefresh: false });
  invalidateOwnerStoreOrdersListCache(sid, uid, {
    ...logOpts,
    scheduleSnapshotRefresh: false,
  });
  scheduleOwnerStoreOrdersListSnapshotRefresh(sid, uid);
}
