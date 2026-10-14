"use client";

import type { DibayPtrOutcome } from "@/lib/ui/ptr/dibay-ptr-ssot";
import { invalidateMeStoresListDedupedCache } from "@/lib/me/fetch-me-stores-deduped";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useSupabaseStoreOrdersRealtime } from "@/hooks/useSupabaseStoreOrdersRealtime";
import { playDeliveryOrderAlertDebounced } from "@/lib/business/delivery-order-alert-debounce";
import { primeStoreOrderAlertAudio } from "@/lib/business/store-order-alert-sound";
import { fetchStoreOrderCountsDeduped } from "@/lib/business/fetch-store-order-counts-deduped";
import type { OwnerHubDashboardPack } from "@/lib/business/load-owner-hub-dashboard-server";
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
import { dispatchOwnerHubBadgeRefresh } from "@/lib/chats/chat-channel-events";
import { usePullToRefreshAtDocumentTop } from "@/lib/ui/use-pull-to-refresh-document-top";
import { useOwnerHubRuntime } from "@/components/business/owner/OwnerHubRuntimeProvider";
import { useOwnerFabOrderChatBadgeCount } from "@/lib/chats/use-owner-hub-badge-total";
import {
  markOwnerDashboardFirstShellPaint,
  scheduleOwnerDashboardAfterFirstPaint,
} from "@/lib/business/owner-dashboard-waterfall";
import {
  OwnerOperationsDashboard,
  parseOpsSnapshotFromCountsJson,
  useOwnerOpsPulse,
} from "@/components/stores/owner/dashboard/OwnerOperationsDashboard";
import { useOwnerCompactShellViewport } from "@/hooks/use-owner-compact-shell-viewport";

export function BusinessAdminDashboard({
  row,
  profile: _profile,
  products: _products,
  canSell: _canSell,
  orderAlertsBadge: _orderAlertsBadge,
  loadRemote,
}: {
  row: StoreRow;
  profile: BusinessProfile;
  products: BusinessProduct[];
  canSell: boolean;
  orderAlertsBadge: number;
  initialDashboard?: OwnerHubDashboardPack | null;
  /** `{ silent: true }` — 로딩 화면 교체 없이 재검증(PTR) */
  loadRemote: (opts?: { silent?: boolean }) => Promise<DibayPtrOutcome | void>;
}) {
  const { t } = useI18n();
  const hubRuntime = useOwnerHubRuntime();
  /** hubRuntime present → previous WhenEnabled(false) forced EMPTY; keep that contract. */
  const fabOrderChatUnread = useOwnerFabOrderChatBadgeCount();
  const orderChatUnread = hubRuntime ? 0 : fabOrderChatUnread;

  const [opsSnapshot, setOpsSnapshot] = useState<OwnerStoreOpsSnapshot | null>(() =>
    peekOwnerStoreOpsSnapshotFromHubCache(row.id)
  );
  const [opsLoaded, setOpsLoaded] = useState(() => peekOwnerStoreOpsSnapshotFromHubCache(row.id) != null);
  const [offline, setOffline] = useState(false);
  const [fetchFailed, setFetchFailed] = useState(false);
  const [snapshotUpdatedAt, setSnapshotUpdatedAt] = useState<Date | null>(null);
  const [opsRefreshing, setOpsRefreshing] = useState(false);
  const loadOpsSnapshotRef = useRef<
    ((opts?: { force?: boolean; quiet?: boolean }) => Promise<boolean>) | null
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

  const loadOpsSnapshot = useCallback(async (opts?: { force?: boolean; quiet?: boolean }): Promise<boolean> => {
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
        return true;
      }
      setOpsSnapshot((prev) => prev ?? EMPTY_OWNER_STORE_OPS_SNAPSHOT);
      setFetchFailed(true);
      return false;
    } catch {
      setOpsSnapshot((prev) => prev ?? EMPTY_OWNER_STORE_OPS_SNAPSHOT);
      setFetchFailed(true);
      return false;
    } finally {
      setOpsLoaded(true);
      if (!opts?.quiet) setOpsRefreshing(false);
    }
  }, [row.id]);

  const loadDashboard = useCallback(
    async (opts?: { silent?: boolean }) => {
      await loadOpsSnapshot({ force: opts?.silent !== true, quiet: opts?.silent === true });
    },
    [loadOpsSnapshot]
  );

  loadOpsSnapshotRef.current = loadOpsSnapshot;
  loadDashboardRef.current = loadDashboard;

  useSupabaseStoreOrdersRealtime(hubRuntime ? null : row.id, {
    debounceMs: 450,
    onChange: () => {
      dispatchOwnerHubBadgeRefresh({ source: "owner_dashboard_store_orders" });
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
    });
  }, [subscribeOrdersRefresh, row.id]);

  useLayoutEffect(() => {
    markOwnerDashboardFirstShellPaint();
  }, []);

  useEffect(() => {
    const peekOps = peekOwnerStoreOpsSnapshotFromHubCache(row.id);
    if (peekOps) {
      setOpsSnapshot(peekOps);
      setOpsLoaded(true);
      setSnapshotUpdatedAt(new Date());
      setFetchFailed(false);
      setOpsRefreshing(false);
    } else {
      setOpsLoaded(false);
    }
    scheduleOwnerDashboardAfterFirstPaint(() => {
      void loadDashboardRef.current?.({ silent: true });
    });
  }, [row.id]);

  useEffect(() => {
    if (hubRuntime) return;
    const id = window.setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        void loadOpsSnapshotRef.current?.({ force: true, quiet: true });
      }
    }, 45_000);
    return () => window.clearInterval(id);
  }, [hubRuntime]);

  const handlePullRefresh = useCallback(async (): Promise<DibayPtrOutcome> => {
    invalidateOwnerHubOrderCountsCache(row.id);
    /* 매장 목록 22s TTL 캐시 — PTR 은 서버 재조회 */
    invalidateMeStoresListDedupedCache();
    /* silent — 로딩 화면으로 대시보드 전체를 교체하지 않음 (D16) */
    const [remoteOutcome, opsOk] = await Promise.all([
      loadRemote({ silent: true }),
      loadOpsSnapshot({ force: true }),
    ]);
    return remoteOutcome === "error" || !opsOk ? "error" : "success";
  }, [loadRemote, loadOpsSnapshot, row.id]);

  const {
    pullPx,
    refreshing,
    result: pullResult,
    willReleaseRefresh,
  } = usePullToRefreshAtDocumentTop(handlePullRefresh);

  const pulseNew = useOwnerOpsPulse(opsSnapshot?.pending_accept_count ?? 0);
  const isOwnerCompactShell = useOwnerCompactShellViewport();

  return (
    <div
      className={
        isOwnerCompactShell
          ? "relative flex min-h-0 flex-1 flex-col"
          : "relative flex w-full min-w-0 flex-col"
      }
    >
      {(refreshing || pullPx > 6 || pullResult != null) && (
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
                <span className="sam-text-xxs font-semibold text-sam-muted">{t("common_loading")}</span>
              </>
            : pullResult != null ?
              <span
                className={`sam-text-xxs font-semibold ${pullResult === "error" ? "text-sam-danger" : "text-sam-fg"}`}
              >
                {pullResult === "error" ? t("ptr_result_error") : t("ptr_result_success")}
              </span>
            : <span className="sam-text-xxs font-semibold text-sam-fg">
                {willReleaseRefresh ? t("store_owner_pull_release_refresh") : t("store_owner_pull_hint")}
              </span>}
          </div>
        </div>
      )}

      <div
        className={
          isOwnerCompactShell ? "flex min-h-0 flex-1 flex-col" : "flex w-full min-w-0 flex-col"
        }
        style={{
          transform: pullPx > 0 ? `translateY(${pullPx}px)` : undefined,
          transition: pullPx === 0 ? "transform 0.2s ease-out" : undefined,
        }}
      >
        <OwnerOperationsDashboard
          row={row}
          snapshot={opsSnapshot}
          loading={!opsSnapshot}
          offline={offline || fetchFailed}
          stale={fetchFailed && opsSnapshot != null}
          orderChatUnread={orderChatUnread}
          pulseNew={pulseNew}
          stores={hubRuntime?.stores ?? null}
          onRefresh={() => void loadOpsSnapshot({ force: true })}
          refreshing={opsRefreshing}
          snapshotUpdatedAt={snapshotUpdatedAt}
          onStoreUpdated={() => void loadRemote()}
        />
      </div>
    </div>
  );
}
