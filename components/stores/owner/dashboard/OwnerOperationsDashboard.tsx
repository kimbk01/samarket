"use client";

import { useEffect, useRef, useState } from "react";
import { OwnerAnnouncementLatestCard } from "@/components/business/owner/OwnerAnnouncementLatestCard";
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
import { OwnerOrderFlowCard } from "./OwnerOrderFlowCard";
import { OwnerSalesSummaryCard } from "./OwnerSalesSummaryCard";
import { OwnerCustomerCareCard } from "./OwnerCustomerCareCard";
import { OwnerInventoryIssueCard } from "./OwnerInventoryIssueCard";
import { OwnerFinanceHomeCards } from "./OwnerFinanceHomeCards";

/**
 * Owner Home — real operating command center.
 * 상태 1줄 → 지금 처리할 주문 → 주문 진행 → 운영 이슈 → 오늘 매출 → 고객 응대 → 보유금액
 * (Owner 2026-11-03 · docs/audit/owner-e2e-round2-review-and-dashboard-design-2026-11-03.md §4).
 * 바로가기 카드 없음 — 하단 탭·재고 카드와 같은 주소 반복 (Owner 권장안 2026-11-03 · UN-10).
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
            {/* 배달 오픈 4단계 — 운영 공지 최신 1건(없으면 안 보임) */}
            <OwnerAnnouncementLatestCard storeId={row.id} />
            <OwnerHomeStoreStatusCard row={row} />
            <OwnerUrgentOrdersCard
              storeId={row.id}
              snapshot={data}
              pulseNew={pulseNew}
              updatedAt={snapshotUpdatedAt ?? null}
              onRefresh={onRefresh}
              refreshing={refreshing}
            />
            <OwnerOrderFlowCard storeId={row.id} snapshot={data} />
            <OwnerInventoryIssueCard storeId={row.id} snapshot={data} />
            <OwnerSalesSummaryCard storeId={row.id} snapshot={data} />
            <OwnerCustomerCareCard
              storeId={row.id}
              orderChatUnread={orderChatUnread}
              reviewsNeedReply={data.reviews_need_reply_count}
            />
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
