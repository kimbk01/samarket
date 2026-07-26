"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useSearchParams } from "next/navigation";
import { fetchStoreOrderCountsDeduped } from "@/lib/business/fetch-store-order-counts-deduped";
import { playDeliveryOrderAlertDebounced } from "@/lib/business/delivery-order-alert-debounce";
import { primeStoreOrderAlertAudio } from "@/lib/business/store-order-alert-sound";
import { dispatchOwnerHubBadgeRefresh } from "@/lib/chats/chat-channel-events";
import { useSupabaseStoreOrdersRealtime } from "@/hooks/useSupabaseStoreOrdersRealtime";
import { storeRowCanSell } from "@/lib/business/store-can-sell";
import type { StoreRow } from "@/lib/stores/db-store-mapper";
import {
  fetchMeStoresListDeduped,
  parseStoreRowsFromMeStoresJson,
  peekMeStoresListClientCache,
} from "@/lib/me/fetch-me-stores-deduped";
import { pickPreferredOwnerStore } from "@/lib/stores/pick-preferred-owner-store";
import { markDeliveryOwnerSurfaceActive } from "@/lib/delivery/owner/owner-surface-activity";
import { parseOwnerStoreOpsSnapshotFromJson } from "@/lib/stores/owner-store-ops-snapshot";
import {
  invalidateOwnerHubOrderCountsCache,
  ownerHubOrderAlertsFromMeta,
  peekOwnerHubOrderCountsCache,
  seedOwnerHubOrderCountsCache,
} from "@/lib/stores/owner-hub-order-counts-cache";
import {
  invalidateOwnerHubDashboardOrdersCache,
  peekOwnerHubDashboardOrdersCache,
} from "@/lib/stores/owner-hub-dashboard-orders-cache";
import { scheduleOwnerDashboardAfterFirstPaint } from "@/lib/business/owner-dashboard-waterfall";
import { recordOwnerHubStoreOrderRealtimeRow } from "@/lib/business/owner-hub-pending-order-bridge";
import { invalidateOwnerStoreOrdersListCacheCoalesced } from "@/lib/stores/owner-store-orders-list-cache-invalidate-coalesce";

type OwnerHubRuntimeValue = {
  stores: StoreRow[] | null;
  selectedRow: StoreRow | null;
  orderAlertsBadge: number;
  refreshOrderAttention: () => Promise<void>;
  /** 대시보드 주문 타임라인 — Runtime Realtime 1곳만 구독 */
  subscribeOrdersRefresh: (listener: () => void) => () => void;
};

const Ctx = createContext<OwnerHubRuntimeValue | null>(null);

function pickRow(stores: StoreRow[], storeIdParam: string): StoreRow | null {
  if (stores.length === 0) return null;
  const byParam =
    storeIdParam.length > 0 ? stores.find((s) => s.id === storeIdParam) : undefined;
  return byParam ?? pickPreferredOwnerStore(stores) ?? stores[0] ?? null;
}

function orderCountsStoreIdFromRow(row: StoreRow | null): string | null {
  if (
    !row ||
    row.approval_status !== "approved" ||
    row.is_visible !== true ||
    !storeRowCanSell(row)
  ) {
    return null;
  }
  return row.id;
}

/**
 * `/stores/owner` 허브 — 주문 배지·Realtime 갱신을 Shell·대시보드가 **한 갈래**만 쓰게 한다.
 */
export function OwnerHubRuntimeProvider({
  initialStores,
  children,
}: {
  initialStores: StoreRow[] | null;
  children: ReactNode;
}) {
  const searchParams = useSearchParams();
  const storeIdParam = searchParams.get("storeId")?.trim() ?? "";

  const [stores, setStores] = useState<StoreRow[] | null>(() => {
    if (initialStores != null && initialStores.length > 0) return initialStores;
    const peek = peekMeStoresListClientCache();
    return parseStoreRowsFromMeStoresJson(peek?.json);
  });
  const storesNetworkHydrateRef = useRef(
    (initialStores != null && initialStores.length > 0) ||
      (() => {
        const peek = peekMeStoresListClientCache();
        return (parseStoreRowsFromMeStoresJson(peek?.json)?.length ?? 0) > 0;
      })()
  );

  useEffect(() => {
    if (storesNetworkHydrateRef.current) return;
    storesNetworkHydrateRef.current = true;
    const cached = peekMeStoresListClientCache();
    const fromCache = parseStoreRowsFromMeStoresJson(cached?.json);
    if (fromCache?.length) {
      setStores(fromCache);
      return;
    }
    let cancelled = false;
    void fetchMeStoresListDeduped().then(({ status, json }) => {
      if (cancelled || status !== 200) return;
      const rows = parseStoreRowsFromMeStoresJson(json);
      if (rows?.length) setStores(rows);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => markDeliveryOwnerSurfaceActive(), []);
  const selectedRow = useMemo(
    () => (stores?.length ? pickRow(stores, storeIdParam) : null),
    [stores, storeIdParam]
  );
  const orderCountsStoreId = orderCountsStoreIdFromRow(selectedRow);

  const [orderAlertsBadge, setOrderAlertsBadge] = useState(() => {
    if (!orderCountsStoreId) return 0;
    const peek =
      peekOwnerHubOrderCountsCache(orderCountsStoreId) ??
      (() => {
        const dash = peekOwnerHubDashboardOrdersCache(orderCountsStoreId);
        return dash ?
            {
              ok: true as const,
              pending_accept_count: dash.meta.pending_accept_count,
              refund_requested_count: dash.meta.refund_requested_count,
              pending_delivery_count: dash.meta.pending_delivery_count,
            }
          : null;
      })();
    return peek ? ownerHubOrderAlertsFromMeta(peek) : 0;
  });

  const prevPendingDeliveryRef = useRef<number | null>(null);
  const alertStoreIdRef = useRef<string | null>(null);
  const ordersRefreshListenersRef = useRef(new Set<() => void>());

  const subscribeOrdersRefresh = useCallback((listener: () => void) => {
    ordersRefreshListenersRef.current.add(listener);
    return () => {
      ordersRefreshListenersRef.current.delete(listener);
    };
  }, []);

  const ordersRefreshNotifyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notifyOrdersRefresh = useCallback(() => {
    if (ordersRefreshNotifyTimerRef.current != null) return;
    ordersRefreshNotifyTimerRef.current = setTimeout(() => {
      ordersRefreshNotifyTimerRef.current = null;
      for (const listener of ordersRefreshListenersRef.current) {
        listener();
      }
    }, 400);
  }, []);

  useEffect(() => {
    alertStoreIdRef.current = orderCountsStoreId;
  }, [orderCountsStoreId]);

  useEffect(() => {
    const fn = () => primeStoreOrderAlertAudio();
    document.addEventListener("pointerdown", fn, { once: true });
    return () => document.removeEventListener("pointerdown", fn);
  }, []);

  const onStoreOrderInsert = useCallback((row: Record<string, unknown>) => {
    const sid = alertStoreIdRef.current?.trim() ?? "";
    if (sid) {
      recordOwnerHubStoreOrderRealtimeRow(sid, row, "INSERT");
      invalidateOwnerStoreOrdersListCacheCoalesced(sid, {
        route: "OwnerHubRuntimeProvider",
        reason: "store_orders_insert",
      });
    }
    if (String(row.fulfillment_type ?? "") !== "local_delivery") return;
    playDeliveryOrderAlertDebounced(alertStoreIdRef.current);
  }, []);

  const refreshOrderAttention = useCallback(async () => {
    if (!orderCountsStoreId) {
      setOrderAlertsBadge(0);
      prevPendingDeliveryRef.current = null;
      return;
    }
    try {
      const { json: raw } = await fetchStoreOrderCountsDeduped(orderCountsStoreId);
      const parsed = parseOwnerStoreOpsSnapshotFromJson(raw);
      if (!parsed) {
        setOrderAlertsBadge(0);
        prevPendingDeliveryRef.current = null;
        return;
      }
      seedOwnerHubOrderCountsCache(orderCountsStoreId, parsed);
      const nextBadge = ownerHubOrderAlertsFromMeta(parsed);
      setOrderAlertsBadge((prev) => (prev === nextBadge ? prev : nextBadge));
      const delivery = parsed.pending_delivery_count;
      const prev = prevPendingDeliveryRef.current;
      if (prev !== null && delivery > prev) {
        playDeliveryOrderAlertDebounced(orderCountsStoreId);
      }
      prevPendingDeliveryRef.current = delivery;
    } catch {
      setOrderAlertsBadge(0);
      prevPendingDeliveryRef.current = null;
    }
  }, [orderCountsStoreId]);

  useEffect(() => {
    if (!orderCountsStoreId) {
      setOrderAlertsBadge(0);
      prevPendingDeliveryRef.current = null;
      return;
    }
    const peek =
      peekOwnerHubOrderCountsCache(orderCountsStoreId) ??
      (() => {
        const dash = peekOwnerHubDashboardOrdersCache(orderCountsStoreId);
        if (!dash) return null;
        seedOwnerHubOrderCountsCache(orderCountsStoreId, dash.meta);
        return peekOwnerHubOrderCountsCache(orderCountsStoreId);
      })();
    if (peek) {
      const nextBadge = ownerHubOrderAlertsFromMeta(peek);
      setOrderAlertsBadge((prev) => (prev === nextBadge ? prev : nextBadge));
      prevPendingDeliveryRef.current = peek.pending_delivery_count;
    } else {
      prevPendingDeliveryRef.current = null;
      scheduleOwnerDashboardAfterFirstPaint(() => {
        void refreshOrderAttention();
      });
    }
    const id = window.setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        void refreshOrderAttention();
      }
    }, 45_000);
    return () => window.clearInterval(id);
  }, [orderCountsStoreId, refreshOrderAttention]);

  useSupabaseStoreOrdersRealtime(orderCountsStoreId, {
    debounceMs: 450,
    onInsert: onStoreOrderInsert,
    onChange: () => {
      /** UPDATE burst — 목록 캐시 무효화는 INSERT 만(주문 화면 RT·single-flight 와 중복 refetch 방지) */
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      dispatchOwnerHubBadgeRefresh({ source: "owner_hub_runtime_store_orders" });
      void (async () => {
        await refreshOrderAttention();
        notifyOrdersRefresh();
      })();
    },
  });

  const value = useMemo(
    () => ({
      stores,
      selectedRow,
      orderAlertsBadge,
      refreshOrderAttention,
      subscribeOrdersRefresh,
    }),
    [stores, selectedRow, orderAlertsBadge, refreshOrderAttention, subscribeOrdersRefresh]
  );

  useEffect(() => {
    return () => {
      if (ordersRefreshNotifyTimerRef.current != null) {
        clearTimeout(ordersRefreshNotifyTimerRef.current);
        ordersRefreshNotifyTimerRef.current = null;
      }
    };
  }, []);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useOwnerHubRuntime(): OwnerHubRuntimeValue | null {
  return useContext(Ctx);
}
