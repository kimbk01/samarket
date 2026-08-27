"use client";

import { useEffect, useRef, useState } from "react";
import type { StoreRow } from "@/lib/stores/db-store-mapper";
import {
  EMPTY_OWNER_STORE_OPS_SNAPSHOT,
  parseOwnerStoreOpsSnapshotFromJson,
  type OwnerStoreOpsSnapshot,
} from "@/lib/stores/owner-store-ops-snapshot";
import {
  OWNER_COMPACT_SHELL_BODY_SCROLL_CLASS,
  OWNER_MOBILE_BOTTOM_NAV_PAD_CLASS,
} from "@/lib/stores/owner-mobile-ui-tokens";
import { OwnerUrgentOrdersCard } from "./OwnerUrgentOrdersCard";
import { OwnerStorePointWarningCard } from "@/components/business/owner/OwnerStorePointWarningCard";
import { OwnerGiftRevenueHomeCard } from "./OwnerGiftRevenueHomeCard";
import { OwnerOrderFlowCard } from "./OwnerOrderFlowCard";
import { OwnerSalesSummaryCard } from "./OwnerSalesSummaryCard";
import { OwnerCustomerCareCard } from "./OwnerCustomerCareCard";
import { OwnerInventoryIssueCard } from "./OwnerInventoryIssueCard";
import { useOwnerHubSubroutePrefetch } from "@/components/business/owner/useOwnerHubSubroutePrefetch";
import { OWNER_DASH_PAGE_CLASS } from "./owner-dashboard-ui";
import { OwnerDashOfflineBanner, OwnerDashSkeleton } from "./owner-dashboard-primitives";

/** 모바일 전용 — 헤더·하단 네비 고정, 카드만 스크롤 */
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
  pointSummary,
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
  pointSummary?: {
    pointBalance: number;
    pointCommerceBlocked: boolean;
    estimatedAcceptCount: number;
  } | null;
}) {
  const data = snapshot ?? EMPTY_OWNER_STORE_OPS_SNAPSHOT;

  useOwnerHubSubroutePrefetch(row.id);

  return (
    <div className={`flex h-full min-h-0 w-full flex-col ${OWNER_DASH_PAGE_CLASS}`}>
      <main
        className={`${OWNER_COMPACT_SHELL_BODY_SCROLL_CLASS} ${OWNER_MOBILE_BOTTOM_NAV_PAD_CLASS} min-h-0 flex-1`}
      >
        <div className="space-y-2.5 pb-2">
          {offline ? <OwnerDashOfflineBanner stale={stale} /> : null}
          {loading && !snapshot ? (
            <>
              <OwnerDashSkeleton lines={4} />
              <OwnerDashSkeleton lines={2} />
            </>
          ) : (
            <>
              {pointSummary ? (
                <OwnerStorePointWarningCard
                  storeId={row.id}
                  pointBalance={pointSummary.pointBalance}
                  pointCommerceBlocked={pointSummary.pointCommerceBlocked}
                />
              ) : null}
              <OwnerGiftRevenueHomeCard storeId={row.id} />
              <OwnerUrgentOrdersCard
                storeId={row.id}
                snapshot={data}
                pulseNew={pulseNew}
                updatedAt={snapshotUpdatedAt ?? null}
                onRefresh={onRefresh}
                refreshing={refreshing}
              />
              <OwnerOrderFlowCard storeId={row.id} snapshot={data} />
              <OwnerSalesSummaryCard storeId={row.id} snapshot={data} />
              <OwnerCustomerCareCard
                storeId={row.id}
                orderChatUnread={orderChatUnread}
              />
              <OwnerInventoryIssueCard storeId={row.id} snapshot={data} />
            </>
          )}
        </div>
      </main>
    </div>
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
