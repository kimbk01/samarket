"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { StoreRow } from "@/lib/stores/db-store-mapper";
import {
  EMPTY_OWNER_STORE_OPS_SNAPSHOT,
  parseOwnerStoreOpsSnapshotFromJson,
  type OwnerStoreOpsSnapshot,
} from "@/lib/stores/owner-store-ops-snapshot";
import { buildStoreOpsMetaFromRow } from "@/lib/stores/owner-store-ops-snapshot";
import { OwnerDashboardHeader } from "./OwnerDashboardHeader";
import { OwnerUrgentOrdersCard } from "./OwnerUrgentOrdersCard";
import { OwnerOrderFlowCard } from "./OwnerOrderFlowCard";
import { OwnerSalesSummaryCard } from "./OwnerSalesSummaryCard";
import { OwnerCustomerCareCard } from "./OwnerCustomerCareCard";
import { OwnerInventoryIssueCard } from "./OwnerInventoryIssueCard";
import { OwnerQuickActions } from "./OwnerQuickActions";
import { OWNER_DASH_PAGE_CLASS, OWNER_HUB_OPS_SCROLL_PADDING_CLASS } from "./owner-dashboard-ui";
import { OwnerDashOfflineBanner, OwnerDashSkeleton } from "./owner-dashboard-primitives";

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
  belowCards,
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
  /** 최근 주문 등 하단 카드 — 스크롤 패딩 영역 안에 포함 */
  belowCards?: ReactNode;
}) {
  const data = snapshot ?? EMPTY_OWNER_STORE_OPS_SNAPSHOT;
  const storeOps = useMemo(() => {
    if (snapshot?.store_ops) return snapshot.store_ops;
    return buildStoreOpsMetaFromRow({
      is_open: row.is_open,
      business_hours_json: row.business_hours_json,
    });
  }, [snapshot?.store_ops, row.is_open, row.business_hours_json]);

  const urgentCount =
    data.pending_accept_count +
    data.cooking_delay_count +
    data.delivery_delay_count +
    data.pending_over_3m_count;

  return (
    <>
      <div
        className={`space-y-2.5 ${OWNER_DASH_PAGE_CLASS} ${OWNER_HUB_OPS_SCROLL_PADDING_CLASS} -mx-0.5 px-0.5`}
      >
        {offline ? <OwnerDashOfflineBanner stale={stale} /> : null}
        <OwnerDashboardHeader
          storeName={row.store_name}
          storeId={row.id}
          storeSlug={row.slug}
          storeOps={storeOps}
          urgentAlertCount={urgentCount}
          stores={stores}
        />
        {loading && !snapshot ? (
          <>
            <OwnerDashSkeleton lines={4} />
            <OwnerDashSkeleton lines={2} />
          </>
        ) : (
          <>
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
              snapshot={data}
              orderChatUnread={orderChatUnread}
            />
            <OwnerInventoryIssueCard storeId={row.id} snapshot={data} />
          </>
        )}
        {belowCards}
      </div>
      <OwnerQuickActions storeId={row.id} />
    </>
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
