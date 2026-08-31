/**
 * UI-2 — Admin hub today-summary bucket aggregation (presentation only).
 */

import type { AdminDeliveryAdListItem } from "@/lib/stores/advertising/admin-delivery-ad-loader";
import {
  DELIVERY_AD_ADMIN_HUB_CONTRACT,
  type DeliveryAdAdminHubTodayBucketId,
} from "@/lib/stores/advertising/delivery-ad-design-board-contract";
import { mapAdminDeliveryAdActionQueuePresentation } from "@/lib/stores/advertising/delivery-ad-admin-action-queue-presentation";
import type { DeliveryAdAdminActionQueueItem } from "@/lib/stores/advertising/delivery-ad-operations-action-queue";

export type AdminHubTodayCounts = Record<DeliveryAdAdminHubTodayBucketId, number>;

export function emptyAdminHubTodayCounts(): AdminHubTodayCounts {
  return Object.fromEntries(
    DELIVERY_AD_ADMIN_HUB_CONTRACT.todaySummaryBuckets.map((b) => [b.id, 0])
  ) as AdminHubTodayCounts;
}

export function aggregateAdminHubTodayCounts(input: {
  campaigns: readonly AdminDeliveryAdListItem[];
  actionQueueItems: readonly DeliveryAdAdminActionQueueItem[];
}): AdminHubTodayCounts {
  const counts = emptyAdminHubTodayCounts();

  for (const item of input.actionQueueItems) {
    const p = mapAdminDeliveryAdActionQueuePresentation({
      productKind: item.productKind,
      lifecycleStatus: item.campaignLifecycle,
      creativeAssetPath: item.creativeAssetPath,
      hadChangesRequested: item.hadChangesRequested,
    });
    if (p.bucket === "new_application") counts.new += 1;
    else if (p.bucket === "resubmit") counts.resubmit += 1;
    else if (p.bucket === "needs_creative") counts.needs_production += 1;
    else if (p.bucket === "awaiting_review") counts.pending_review += 1;
  }

  for (const c of input.campaigns) {
    if (c.listBucket === "scheduled") counts.scheduled += 1;
    if (c.listBucket === "active") counts.active += 1;
    if (c.listBucket === "held") counts.pending_payment += 1;
    if (c.lifecycleStatus === "PAUSED_OWNER" || c.lifecycleStatus === "PAUSED_ADMIN") {
      counts.paused += 1;
    }
    if (
      c.listBucket === "review" &&
      !input.actionQueueItems.some((q) => q.campaignId === c.id)
    ) {
      counts.pending_review += 1;
    }
  }

  return counts;
}
