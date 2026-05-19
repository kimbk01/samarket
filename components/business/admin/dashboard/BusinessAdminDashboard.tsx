"use client";

import Link from "next/link";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useSupabaseStoreOrdersRealtime } from "@/hooks/useSupabaseStoreOrdersRealtime";
import { playDeliveryOrderAlertDebounced } from "@/lib/business/delivery-order-alert-debounce";
import { primeStoreOrderAlertAudio } from "@/lib/business/store-order-alert-sound";
import { fetchStoreOrderCountsDeduped } from "@/lib/business/fetch-store-order-counts-deduped";
import { fetchStoreOrdersListDeduped } from "@/lib/stores/fetch-store-orders-list-deduped";
import type { OwnerHubDashboardPack } from "@/lib/business/load-owner-hub-dashboard-server";
import {
  invalidateOwnerHubDashboardOrdersCache,
  peekOwnerHubDashboardOrdersCache,
} from "@/lib/stores/owner-hub-dashboard-orders-cache";
import { coalesceOwnerHubOrdersNetworkRefresh } from "@/lib/stores/owner-hub-orders-network-coalesce";
import {
  invalidateOwnerHubOrderCountsCache,
  peekOwnerStoreOpsSnapshotFromHubCache,
} from "@/lib/stores/owner-hub-order-counts-cache";
import type { BusinessProduct, BusinessProfile } from "@/lib/types/business";
import type { StoreRow } from "@/lib/stores/db-store-mapper";
import {
  EMPTY_OWNER_STORE_OPS_SNAPSHOT,
  type OwnerStoreOpsSnapshot,
} from "@/lib/stores/owner-store-ops-snapshot";
import { BusinessDashboardOrderTimeline, type TimelineOrder } from "@/components/business/admin/dashboard/BusinessDashboardOrderTimeline";
import { buildStoreOrdersHref } from "@/lib/business/store-orders-tab";
import { dispatchOwnerHubBadgeRefresh } from "@/lib/chats/chat-channel-events";
import { usePullToRefreshAtDocumentTop } from "@/lib/ui/use-pull-to-refresh-document-top";
import { useOwnerHubRuntime } from "@/components/business/owner/OwnerHubRuntimeProvider";
import { useOwnerHubBadgeBreakdownWhenEnabled } from "@/lib/chats/use-owner-hub-badge-total";
import { OwnerDashSectionHeader } from "@/components/stores/owner/dashboard/OwnerDashSectionHeader";
import {
  OwnerOperationsDashboard,
  parseOpsSnapshotFromCountsJson,
  useOwnerOpsPulse,
} from "@/components/stores/owner/dashboard/OwnerOperationsDashboard";

export function BusinessAdminDashboard({
  row,
  profile: _profile,
  products: _products,
  canSell: _canSell,
  orderAlertsBadge: _orderAlertsBadge,
  initialDashboard = null,
  loadRemote,
}: {
  row: StoreRow;
  profile: BusinessProfile;
  products: BusinessProduct[];
  canSell: boolean;
  orderAlertsBadge: number;
  initialDashboard?: OwnerHubDashboardPack | null;
  loadRemote: () => Promise<void>;
}) {
  const hubRuntime = useOwnerHubRuntime();
  const badge = useOwnerHubBadgeBreakdownWhenEnabled(!hubRuntime);
  const orderChatUnread = badge.storeOrderChatUnread;

  const ordersBaseHref = buildStoreOrdersHref({ storeId: row.id });

  const dashboardSeed =
    initialDashboard ??
    (() => {
      const peek = peekOwnerHubDashboardOrdersCache(row.id);
      return peek ? { orders: peek.orders, meta: peek.meta } : null;
    })();

  const [orders, setOrders] = useState<TimelineOrder[]>(() => dashboardSeed?.orders ?? []);
  const [opsSnapshot, setOpsSnapshot] = useState<OwnerStoreOpsSnapshot | null>(() =>
    peekOwnerStoreOpsSnapshotFromHubCache(row.id)
  );
  const [opsLoaded, setOpsLoaded] = useState(() => peekOwnerStoreOpsSnapshotFromHubCache(row.id) != null);
  const [offline, setOffline] = useState(false);
  const [fetchFailed, setFetchFailed] = useState(false);
  const [snapshotUpdatedAt, setSnapshotUpdatedAt] = useState<Date | null>(null);
  const [opsRefreshing, setOpsRefreshing] = useState(false);
  const hasDashboardSeedRef = useRef(dashboardSeed != null);
  const loadDashboardOrdersRef = useRef<
    ((opts?: { silent?: boolean; forceNetwork?: boolean }) => Promise<void>) | null
  >(null);
  const loadOpsSnapshotRef = useRef<
    ((opts?: { force?: boolean; quiet?: boolean }) => Promise<void>) | null
  >(null);
  const loadDashboardRef = useRef<((opts?: { silent?: boolean }) => Promise<void>) | null>(null);

  const alertStoreIdRef = useRef<string | null>(null);
  useLayoutEffect(() => {
    alertStoreIdRef.current = row.id;
  }, [row.id]);

  useEffect(() => {
    const fn = () => primeStoreOrderAlertAudio();
    document.addEventListener("pointerdown", fn, { once: true });
    return () => document.removeEventListener("pointerdown", fn);
  }, []);

  useEffect(() => {
    const sync = () => setOffline(typeof navigator !== "undefined" && !navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  const onStoreOrderInsert = useCallback((r: Record<string, unknown>) => {
    if (String(r.fulfillment_type ?? "") !== "local_delivery") return;
    playDeliveryOrderAlertDebounced(alertStoreIdRef.current);
  }, []);

  const loadOpsSnapshot = useCallback(async (opts?: { force?: boolean; quiet?: boolean }) => {
    if (!opts?.quiet) setOpsRefreshing(true);
    try {
      const { status, json } = await fetchStoreOrderCountsDeduped(row.id, {
        force: opts?.force === true,
      });
      const parsed = parseOpsSnapshotFromCountsJson(json);
      if (status === 200 && parsed) {
        setOpsSnapshot(parsed);
        setSnapshotUpdatedAt(new Date());
        setFetchFailed(false);
      } else {
        setOpsSnapshot((prev) => prev ?? EMPTY_OWNER_STORE_OPS_SNAPSHOT);
        setFetchFailed(true);
      }
    } catch {
      setOpsSnapshot((prev) => prev ?? EMPTY_OWNER_STORE_OPS_SNAPSHOT);
      setFetchFailed(true);
    } finally {
      setOpsLoaded(true);
      if (!opts?.quiet) setOpsRefreshing(false);
    }
  }, [row.id]);

  const loadDashboardOrders = useCallback(async (opts?: { silent?: boolean; forceNetwork?: boolean }) => {
    try {
      const oj = await fetchStoreOrdersListDeduped(row.id, {
        forceNetwork: opts?.forceNetwork === true,
      });
      const ordersJson = oj.json as {
        ok?: boolean;
        orders?: TimelineOrder[];
      };
      if (ordersJson?.ok && Array.isArray(ordersJson.orders)) {
        setOrders((prev) => {
          if (
            prev.length === ordersJson.orders!.length &&
            prev.every((o, i) => o.id === ordersJson.orders![i]?.id && o.order_status === ordersJson.orders![i]?.order_status)
          ) {
            return prev;
          }
          return ordersJson.orders!;
        });
      } else {
        setOrders([]);
      }
    } catch {
      setOrders([]);
    }
  }, [row.id]);

  const refreshDashboardOrdersFromNetwork = useCallback(() => {
    return coalesceOwnerHubOrdersNetworkRefresh(row.id, () =>
      loadDashboardOrders({ silent: true, forceNetwork: true })
    );
  }, [row.id, loadDashboardOrders]);

  const loadDashboard = useCallback(
    async (opts?: { silent?: boolean }) => {
      await Promise.all([
        loadDashboardOrders(opts),
        loadOpsSnapshot({ force: opts?.silent !== true, quiet: opts?.silent === true }),
      ]);
    },
    [loadDashboardOrders, loadOpsSnapshot]
  );

  loadDashboardOrdersRef.current = loadDashboardOrders;
  loadOpsSnapshotRef.current = loadOpsSnapshot;
  loadDashboardRef.current = loadDashboard;

  useSupabaseStoreOrdersRealtime(hubRuntime ? null : row.id, {
    debounceMs: 450,
    onChange: () => {
      dispatchOwnerHubBadgeRefresh({ source: "owner_dashboard_store_orders" });
      void refreshDashboardOrdersFromNetwork();
      void loadOpsSnapshotRef.current?.({ force: true, quiet: true });
    },
    onInsert: onStoreOrderInsert,
  });

  const subscribeOrdersRefresh = hubRuntime?.subscribeOrdersRefresh;

  useEffect(() => {
    if (!subscribeOrdersRefresh) return;
    return subscribeOrdersRefresh(() => {
      dispatchOwnerHubBadgeRefresh({ source: "owner_dashboard_store_orders" });
      const peekOps = peekOwnerStoreOpsSnapshotFromHubCache(row.id);
      if (peekOps) {
        setOpsSnapshot(peekOps);
        setSnapshotUpdatedAt(new Date());
        setOpsLoaded(true);
        setFetchFailed(false);
      } else {
        void loadOpsSnapshotRef.current?.({ force: false, quiet: true });
      }
      void coalesceOwnerHubOrdersNetworkRefresh(row.id, async () => {
        await loadDashboardOrdersRef.current?.({ silent: true, forceNetwork: true });
      });
    });
  }, [subscribeOrdersRefresh, row.id]);

  useEffect(() => {
    const peekOps = peekOwnerStoreOpsSnapshotFromHubCache(row.id);
    setOpsSnapshot(peekOps);
    setOpsLoaded(peekOps != null);
    setSnapshotUpdatedAt(peekOps ? new Date() : null);
    setFetchFailed(false);
    setOpsRefreshing(false);

    const peekOrders = peekOwnerHubDashboardOrdersCache(row.id);
    if (peekOrders?.orders) {
      setOrders(peekOrders.orders);
    }

    if (hasDashboardSeedRef.current) {
      hasDashboardSeedRef.current = false;
    }
    void loadDashboardRef.current?.({ silent: true });
  }, [row.id]);

  useEffect(() => {
    if (hubRuntime) return;
    const id = window.setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        void refreshDashboardOrdersFromNetwork();
        void loadOpsSnapshotRef.current?.({ force: true, quiet: true });
      }
    }, 45_000);
    return () => window.clearInterval(id);
  }, [hubRuntime, refreshDashboardOrdersFromNetwork]);

  const handlePullRefresh = useCallback(async () => {
    invalidateOwnerHubDashboardOrdersCache(row.id);
    invalidateOwnerHubOrderCountsCache(row.id);
    await Promise.all([
      loadRemote(),
      loadDashboardOrders({ silent: true, forceNetwork: true }),
      loadOpsSnapshot({ force: true }),
    ]);
  }, [loadRemote, loadDashboardOrders, loadOpsSnapshot, row.id]);

  const { pullPx, refreshing, willReleaseRefresh } = usePullToRefreshAtDocumentTop(handlePullRefresh);

  const timelineOrders = useMemo(() => orders.slice(0, 8), [orders]);
  const pulseNew = useOwnerOpsPulse(opsSnapshot?.pending_accept_count ?? 0);

  return (
    <div className="relative">
      {(refreshing || pullPx > 6) && (
        <div
          aria-live="polite"
          className="pointer-events-none absolute inset-x-0 z-10 flex justify-center"
          style={{
            top: "-0.125rem",
            transform: `translateY(${Math.min(pullPx, 56)}px)`,
          }}
        >
          <div className="flex items-center gap-2 rounded-full border border-sam-border-soft bg-sam-surface/95 px-3 py-1.5 backdrop-blur-sm">
            {refreshing ?
              <>
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-sam-muted" aria-hidden />
                <span className="sam-text-xxs font-semibold text-sam-muted">불러오는 중…</span>
              </>
            : <span className="sam-text-xxs font-semibold text-sam-fg">
                {willReleaseRefresh ? "놓으면 새로고침" : "아래로 당겨 새로고침"}
              </span>}
          </div>
        </div>
      )}

      <div
        className="space-y-3"
        style={{
          transform: pullPx > 0 ? `translateY(${pullPx}px)` : undefined,
          transition: pullPx === 0 ? "transform 0.2s ease-out" : undefined,
        }}
      >
        <OwnerOperationsDashboard
          row={row}
          snapshot={opsSnapshot}
          loading={!opsLoaded}
          offline={offline || fetchFailed}
          stale={fetchFailed && opsSnapshot != null}
          orderChatUnread={orderChatUnread}
          pulseNew={pulseNew}
          stores={hubRuntime?.stores ?? null}
          onRefresh={() => void loadOpsSnapshot({ force: true })}
          refreshing={opsRefreshing}
          snapshotUpdatedAt={snapshotUpdatedAt}
          belowCards={
            <section
              className="overflow-hidden rounded-[4px] border border-[#E5E7EB] bg-white p-3 shadow-none"
              aria-labelledby="owner-dash-recent-orders"
            >
              <OwnerDashSectionHeader
                id="owner-dash-recent-orders"
                title="최근 주문"
                href={ordersBaseHref}
              />
              <div className="pt-1">
                <BusinessDashboardOrderTimeline storeId={row.id} orders={timelineOrders} />
              </div>
            </section>
          }
        />
      </div>
    </div>
  );
}
