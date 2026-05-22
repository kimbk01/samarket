import { cache } from "react";
import type { TimelineOrder } from "@/components/business/admin/dashboard/BusinessDashboardOrderTimeline";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { fetchOwnerStoreOrderCounts } from "@/lib/stores/fetch-owner-store-order-counts";
import type { OwnerStoreOpsSnapshot } from "@/lib/stores/owner-store-ops-snapshot";
import { getCachedStoreIfOwner } from "@/lib/stores/owner-store-ownership-cache";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export type OwnerHubDashboardPack = {
  /** Dashboard no longer renders order rows; kept empty for cache/backfill compatibility. */
  orders: TimelineOrder[];
  meta: {
    pending_accept_count: number;
    refund_requested_count: number;
    pending_delivery_count: number;
  };
  /** RSC 1회 조회 — 클라 `order-counts` cold 왕복·첫 paint block 완화용 시드 */
  opsSnapshotSeed?: OwnerStoreOpsSnapshot;
};

/**
 * `/stores/owner` 허브 — KPI meta 만 RSC 1회에 선로딩.
 * 상세 주문 관리는 `/stores/owner/orders` 의 목록 API가 SoT 이므로 허브에서 주문 행을 읽지 않는다.
 */
export const loadOwnerHubDashboardPackServer = cache(
  async (storeId: string): Promise<OwnerHubDashboardPack | null> => {
    const id = storeId.trim();
    if (!id) return null;

    const userId = await getRouteUserId();
    if (!userId) return null;

    const sb = tryGetSupabaseForStores();
    if (!sb) return null;

    const gate = await getCachedStoreIfOwner(sb, userId, id);
    if (!gate.ok) return null;

    const counts = await fetchOwnerStoreOrderCounts(sb, id);

    return {
      orders: [],
      meta: {
        pending_accept_count: counts.pending_accept_count,
        refund_requested_count: counts.refund_requested_count,
        pending_delivery_count: counts.pending_delivery_count,
      },
      opsSnapshotSeed: counts,
    };
  }
);
