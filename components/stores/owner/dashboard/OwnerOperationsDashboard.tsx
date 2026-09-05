"use client";

import { useEffect, useRef, useState } from "react";
import type { StoreRow } from "@/lib/stores/db-store-mapper";
import {
  EMPTY_OWNER_STORE_OPS_SNAPSHOT,
  parseOwnerStoreOpsSnapshotFromJson,
  type OwnerStoreOpsSnapshot,
} from "@/lib/stores/owner-store-ops-snapshot";
import { OwnerAdminPageScrollShell } from "@/components/business/owner/OwnerAdminPageScrollShell";
import { useOwnerHubSubroutePrefetch } from "@/components/business/owner/useOwnerHubSubroutePrefetch";
import { OWNER_DASH_PAGE_CLASS } from "./owner-dashboard-ui";
import { OwnerDashOfflineBanner, OwnerDashSkeleton } from "./owner-dashboard-primitives";
import { OwnerHomeStoreStatusCard } from "./OwnerHomeStoreStatusCard";
import { OwnerUrgentOrdersCard } from "./OwnerUrgentOrdersCard";
import { OwnerHomeQuickActionsCard } from "./OwnerHomeQuickActionsCard";
import { OwnerOrderFlowCard } from "./OwnerOrderFlowCard";
import { OwnerSalesSummaryCard } from "./OwnerSalesSummaryCard";
import { OwnerCustomerCareCard } from "./OwnerCustomerCareCard";
import { OwnerInventoryIssueCard } from "./OwnerInventoryIssueCard";
import { OwnerFinanceHomeCards } from "./OwnerFinanceHomeCards";

/**
 * Owner Home — real operating command center.
 * A Store status → B Action required → C Order queue → D Today business →
 * E Customer response → F Quick actions → G Finance (secondary) → H Low-priority.
 */
export function OwnerOperationsDashboard({
  row,
  snapshot,
  loading,
  offline,
  stale,
  orderChatUnread,
  pulseNew,
  stores,
  onRefresh,
  refreshing,
  snapshotUpdatedAt,
  onStoreUpdated,
}: {
  row: StoreRow;
  snapshot: OwnerStoreOpsSnapshot | null;
  loading: boolean;
  offline: boolean;
  stale?: boolean;
  orderChatUnread: number;
  pulseNew?: boolean;
  stores?: StoreRow[] | null;
  onRefresh?: () => void;
  refreshing?: boolean;
  snapshotUpdatedAt?: Date | null;
  onStoreUpdated?: () => void | Promise<void>;
}) {
  void stores;
  const data = snapshot ?? EMPTY_OWNER_STORE_OPS_SNAPSHOT;

  useOwnerHubSubroutePrefetch(row.id);

  return (
    <OwnerAdminPageScrollShell className={OWNER_DASH_PAGE_CLASS}>
      <div className="space-y-2.5 pb-2" data-owner-home-action-first="1">
        {offline ? <OwnerDashOfflineBanner stale={stale} /> : null}
        {loading && !snapshot ? (
          <>
            <OwnerDashSkeleton lines={4} />
            <OwnerDashSkeleton lines={2} />
          </>
        ) : (
          <>
            {/* STORE OS hierarchy: status → urgent orders → problems → today → customer → finance */}
            <OwnerHomeStoreStatusCard
              row={row}
              onUpdated={onStoreUpdated ?? (async () => undefined)}
            />
            <OwnerUrgentOrdersCard
              storeId={row.id}
              snapshot={data}
              pulseNew={pulseNew}
              updatedAt={snapshotUpdatedAt ?? null}
              onRefresh={onRefresh}
              refreshing={refreshing}
            />
            <OwnerInventoryIssueCard storeId={row.id} snapshot={data} />
            <OwnerOrderFlowCard storeId={row.id} snapshot={data} />
            <OwnerSalesSummaryCard storeId={row.id} snapshot={data} />
            <OwnerCustomerCareCard storeId={row.id} orderChatUnread={orderChatUnread} />
            <OwnerHomeQuickActionsCard storeId={row.id} chatBadge={orderChatUnread} />
            <section data-owner-home-secondary-finance="1" className="space-y-1.5 pt-1">
              <OwnerFinanceHomeCards storeId={row.id} />
            </section>
          </>
        )}
      </div>
    </OwnerAdminPageScrollShell>
  );
}

export function parseOpsSnapshotFromCountsJson(json: unknown): OwnerStoreOpsSnapshot | null {
  return parseOwnerStoreOpsSnapshotFromJson(json);
}

export function useOwnerOpsPulse(pendingAccept: number): boolean {
  const prevRef = useRef<number | null>(null);
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = pendingAccept;
    if (prev != null && pendingAccept > prev) {
      setPulse(true);
      const t = window.setTimeout(() => setPulse(false), 4000);
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [pendingAccept]);

  return pulse;
}
