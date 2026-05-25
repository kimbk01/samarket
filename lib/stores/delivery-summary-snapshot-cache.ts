/**
 * Delivery summary snapshot invalidation.
 */
import { scheduleDeliverySummarySnapshotRefresh } from "@/lib/stores/delivery-summary-snapshot-refresh";

export function invalidateDeliverySummarySnapshotCache(
  storeId: string,
  ownerUserId?: string | null
): void {
  const sid = storeId.trim();
  if (!sid) return;
  scheduleDeliverySummarySnapshotRefresh(sid, ownerUserId ?? null);
}
