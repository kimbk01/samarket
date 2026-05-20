"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { playDeliveryOrderAlertDebounced } from "@/lib/business/delivery-order-alert-debounce";
import { primeStoreOrderAlertAudio } from "@/lib/business/store-order-alert-sound";
import { useOwnerStoreOrdersRealtime } from "@/hooks/stores/useOwnerStoreOrdersRealtime";
import {
  useSupabaseStoreOrderDeliveriesRealtime,
  type StoreOrderDeliveryRealtimeEvent,
} from "@/hooks/useSupabaseStoreOrderDeliveriesRealtime";
import {
  deliveryStatusOf,
  mapRealtimeRecordToOrderDelivery,
  mergeRealtimeRecordIntoOrderDelivery,
} from "@/lib/business/owner-store-order-delivery-row-rt";
import { patchOwnerStoreOrderStatus } from "@/lib/business/patch-owner-store-order-status";
import { OWNER_AUTO_ACCEPT_PREP_MINUTES } from "@/lib/business/owner-order-stepper-transition";
import {
  listRowToOwnerOrder,
  normalizeOwnerStoreOrderListRow,
  normalizeOwnerStoreOrderListRows,
  ownerOrdersToListRows,
  parseOwnerStoreOrderListRowFromApi,
  parseOwnerStoreOrdersListFromApiJson,
  sortOwnerStoreOrderListRowsDesc,
  type OwnerStoreOrderListRow,
} from "@/lib/business/owner-store-order-list-row-bridge";
import { useRefetchOnPageShowRestore } from "@/lib/ui/use-refetch-on-page-show";
import {
  buildStoreOrdersHref,
  orderMatchesStoreTab,
  parseStoreOrderTab,
  type StoreOrderTabId,
} from "@/lib/business/store-orders-tab";
import {
  countOrdersMatchingTab,
  ownerOrderMainTabForStatus,
} from "@/lib/business/owner-order-main-tab";
import { buildOwnerOrdersViewInitialState } from "@/lib/business/build-owner-orders-view-initial-state";
import { pickOwnerStoreFromMeList } from "@/lib/business/pick-owner-store-from-me-list";
import { OwnerStoreOrdersMobileBody } from "@/components/business/owner/OwnerStoreOrdersMobileBody";
import { OWNER_STORE_STACK_Y_CLASS } from "@/lib/business/owner-store-stack";
import { KASAMA_OWNER_HUB_BADGE_REFRESH } from "@/lib/chats/chat-channel-events";
import { KASAMA_NOTIFICATIONS_UPDATED } from "@/lib/notifications/notification-events";
import { fetchMeStoresListDeduped } from "@/lib/me/fetch-me-stores-deduped";
import {
  r2d1OwnerOrdersTrace,
  r2d1OwnerOrdersTraceInstallCollector,
} from "@/lib/dibay/r2-d1-owner-orders-trace";
import {
  r2d1KpiMetaTrace,
  r2d1KpiMetaTraceInstallCollector,
} from "@/lib/dibay/r2-d1-kpi-meta-trace";
import { deriveOwnerStoreOrderMetaCounts } from "@/lib/stores/derive-owner-store-order-meta-counts";
import { setOwnerOrdersAttentionBridge } from "@/lib/business/owner-orders-attention-bridge";
import { fetchStoreOrdersListDeduped } from "@/lib/stores/fetch-store-orders-list-deduped";
import {
  parseStoreRowsFromMeStoresJson,
  peekMeStoresListClientCache,
} from "@/lib/me/fetch-me-stores-deduped";
type OrderRow = OwnerStoreOrderListRow;

function ownerOrdersUiTabForStatus(orderStatus: string): StoreOrderTabId {
  const tab = ownerOrderMainTabForStatus(orderStatus);
  if (tab === "new" || tab === "progress" || tab === "done" || tab === "cancelled") return tab;
  return "all";
}

function startOfTodayMs(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function completedAtMs(o: OrderRow): number {
  const u = typeof o.updated_at === "string" ? o.updated_at.trim() : "";
  if (u) {
    const t = new Date(u).getTime();
    if (Number.isFinite(t)) return t;
  }
  return new Date(o.created_at).getTime();
}


export function OwnerStoreOrdersView() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = useMemo(() => parseStoreOrderTab(searchParams.get("tab")), [searchParams]);
  const urlStoreId = useMemo(() => searchParams.get("storeId")?.trim() ?? "", [searchParams]);
  const highlightOrderId = useMemo(() => searchParams.get("order_id")?.trim() ?? "", [searchParams]);
  const highlightChatOrderId = useMemo(
    () => searchParams.get("chat_order_id")?.trim() ?? "",
    [searchParams]
  );
  const loginHref = "/login";
  const ownerNotifAckRef = useRef(false);
  const deepLinkEnrichAttemptedRef = useRef(false);
  const deepLinkChatEnrichAttemptedRef = useRef(false);

  const [state, setState] = useState(() => buildOwnerOrdersViewInitialState(urlStoreId));

  const prevPendingDeliveryRef = useRef<number | null>(null);
  const alertStoreIdRef = useRef<string | null>(null);
  const storeListCtxRef = useRef({ storeSlug: "", storeName: "" });
  const lastLoadReasonRef = useRef<string>("mount");
  const kpiTracePrevRef = useRef({
    pendingSummary: -1,
    pendingMeta: -1,
    tabNew: -1,
    tabProgress: -1,
    chipAccept: false,
    chipDelivery: false,
  });

  useLayoutEffect(() => {
    alertStoreIdRef.current = state.kind === "ok" ? state.storeId : null;
  }, [state]);

  useLayoutEffect(() => {
    if (state.kind !== "ok") {
      setOwnerOrdersAttentionBridge(null, null);
      return;
    }
    const meta = deriveOwnerStoreOrderMetaCounts(state.orders);
    setOwnerOrdersAttentionBridge(
      state.storeId,
      meta.pendingAcceptCount + meta.refundRequestedCount
    );
    return () => setOwnerOrdersAttentionBridge(null, null);
  }, [state]);

  useEffect(() => {
    const fn = () => primeStoreOrderAlertAudio();
    document.addEventListener("pointerdown", fn, { once: true });
    return () => document.removeEventListener("pointerdown", fn);
  }, []);

  const load = useCallback(async (opts?: { silent?: boolean; reason?: string }) => {
    const silent = opts?.silent === true;
    const reason = opts?.reason?.trim() || (silent ? "silent_load" : "initial_load");
    lastLoadReasonRef.current = reason;
    const traceKind =
      reason === "realtime_deliveries"
        ? "delivery_reload"
        : reason === "page_show_restore"
          ? "pageshow_fetch"
          : reason === "poll_45s" || reason === "visibility_visible"
            ? "poll_fetch"
            : "full_reload";
    r2d1OwnerOrdersTrace({
      kind: traceKind,
      source: "OwnerStoreOrdersView.load",
      owner: "OwnerStoreOrdersView",
      fetchReason: reason,
      storeId: alertStoreIdRef.current ?? undefined,
      silent,
    });
    if (!silent) setState({ kind: "loading" });
    try {
      const storesPeek = peekMeStoresListClientCache();
      let prefetchStore: { id: string; store_name?: string; slug?: string } | null = null;
      if (storesPeek?.status === 200) {
        const cachedStores = parseStoreRowsFromMeStoresJson(storesPeek.json);
        if (cachedStores?.length) {
          prefetchStore = pickOwnerStoreFromMeList(
            cachedStores as { id: string; store_name?: string; slug?: string }[],
            urlStoreId
          );
        }
      }

      const storesTask = fetchMeStoresListDeduped();
      const ordersTask = prefetchStore
        ? fetchStoreOrdersListDeduped(prefetchStore.id)
        : null;

      const [{ status: srStatus, json: rawSj }, prefetchedOrders] = await Promise.all([
        storesTask,
        ordersTask ?? Promise.resolve(null),
      ]);

      const sj = rawSj as { ok?: boolean; stores?: { id: string; store_name?: string }[] };
      if (srStatus === 401) {
        if (!silent) setState({ kind: "unauth" });
        return;
      }
      if (srStatus === 503) {
        if (!silent) setState({ kind: "config" });
        return;
      }
      if (!sj?.ok || !Array.isArray(sj.stores) || sj.stores.length === 0) {
        if (!silent) setState({ kind: "no_store" });
        return;
      }
      const store = pickOwnerStoreFromMeList(
        sj.stores as { id: string; store_name?: string; slug?: string }[],
        urlStoreId
      );
      if (!store) {
        if (!silent) setState({ kind: "no_store" });
        return;
      }
      storeListCtxRef.current = {
        storeSlug: String(store.slug ?? "").trim(),
        storeName: String(store.store_name ?? "내 매장"),
      };

      let rawOj: unknown;
      if (
        prefetchStore?.id === store.id &&
        prefetchedOrders &&
        prefetchedOrders.status === 200
      ) {
        rawOj = prefetchedOrders.json;
      } else {
        const ordersRes = await fetchStoreOrdersListDeduped(store.id);
        rawOj = ordersRes.json;
      }
      const oj = rawOj as {
        ok?: boolean;
        error?: string;
        meta?: { refund_requested_count?: unknown; pending_accept_count?: unknown; pending_delivery_count?: unknown };
        orders?: unknown;
      };
      if (!oj?.ok) {
        if (!silent) {
          setState({
            kind: "error",
            message: typeof oj?.error === "string" ? oj.error : "load_failed",
          });
        }
        return;
      }
      setState({
        kind: "ok",
        storeId: store.id,
        storeName: String(store.store_name ?? "내 매장"),
        orders: parseOwnerStoreOrdersListFromApiJson(oj),
      });
    } catch {
      if (!silent) setState({ kind: "error", message: "network_error" });
    }
  }, [urlStoreId]);

  useEffect(() => {
    r2d1OwnerOrdersTraceInstallCollector();
    r2d1KpiMetaTraceInstallCollector();
    void load({
      reason: "mount",
      silent: state.kind === "ok",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount: 초기 ok 캐시면 silent 백그라운드 정합만
  }, [load]);

  useEffect(() => {
    deepLinkEnrichAttemptedRef.current = false;
  }, [highlightOrderId, urlStoreId]);

  useEffect(() => {
    deepLinkChatEnrichAttemptedRef.current = false;
  }, [highlightChatOrderId, urlStoreId]);

  const summaryCounts = useMemo(() => {
    if (state.kind !== "ok") {
      return { pending: 0, preparing: 0, delivering: 0, doneToday: 0 };
    }
    const t0 = startOfTodayMs();
    let pending = 0;
    let preparing = 0;
    let delivering = 0;
    let doneToday = 0;
    for (const o of state.orders) {
      if (o.order_status === "pending") pending += 1;
      if (o.order_status === "accepted" || o.order_status === "preparing") preparing += 1;
      if (o.order_status === "delivering" || o.order_status === "arrived") delivering += 1;
      if (o.order_status === "completed" && completedAtMs(o) >= t0) doneToday += 1;
    }
    return { pending, preparing, delivering, doneToday };
  }, [state]);

  const tabBadges = useMemo(() => {
    if (state.kind !== "ok") return { new: 0, progress: 0 };
    return {
      new: countOrdersMatchingTab(state.orders, "new"),
      progress: countOrdersMatchingTab(state.orders, "progress"),
    };
  }, [state]);

  const metaCounts = useMemo(() => {
    if (state.kind !== "ok") {
      return { pendingAcceptCount: 0, pendingDeliveryCount: 0, refundRequestedCount: 0 };
    }
    return deriveOwnerStoreOrderMetaCounts(state.orders);
  }, [state]);

  useEffect(() => {
    if (state.kind !== "ok") return;
      const pending = metaCounts.pendingAcceptCount;
      const prev = prevPendingDeliveryRef.current;
      if (prev !== null && pending > prev) {
      playDeliveryOrderAlertDebounced(state.storeId);
    }
      prevPendingDeliveryRef.current = pending;
  }, [state, metaCounts.pendingAcceptCount]);

  useLayoutEffect(() => {
    if (state.kind !== "ok") return;
    const pendingSummary = summaryCounts.pending;
    const pendingMetaDerived = metaCounts.pendingAcceptCount;
    const prev = kpiTracePrevRef.current;
    const highlightOid = highlightOrderId || undefined;

    if (pendingSummary !== prev.pendingSummary) {
      r2d1KpiMetaTrace({
        kind: "summary_render",
        pendingSummary,
        pendingMetaDerived,
        source: "OwnerStoreOrdersView.summaryCounts",
        orderId: highlightOid,
      });
    }

    if (pendingMetaDerived !== prev.pendingMeta) {
      r2d1KpiMetaTrace({
        kind: "kpi_derive_update",
        pendingSummary,
        pendingMetaDerived,
        pendingDeliveryMeta: metaCounts.pendingDeliveryCount,
        refundMeta: metaCounts.refundRequestedCount,
        source: "OwnerStoreOrdersView.metaCounts",
        orderId: highlightOid,
      });
    }

    if (
      prev.pendingSummary >= 0 &&
      prev.pendingMeta >= 0 &&
      prev.pendingSummary !== prev.pendingMeta &&
      pendingSummary === pendingMetaDerived
    ) {
      r2d1KpiMetaTrace({
        kind: "stale_window_closed",
        pendingSummary,
        pendingMetaDerived,
        source: "OwnerStoreOrdersView.kpi_unified",
        orderId: highlightOid,
        detail: "summary_equals_derived_meta",
      });
    }

    if (tabBadges.new !== prev.tabNew || tabBadges.progress !== prev.tabProgress) {
      r2d1KpiMetaTrace({
        kind: "tab_badge_render",
        pendingSummary,
        pendingMetaDerived,
        source: "OwnerStoreOrdersView.tabBadges",
        detail: `new=${tabBadges.new},progress=${tabBadges.progress}`,
      });
    }

    const chipAccept = metaCounts.pendingAcceptCount > 0;
    const chipDelivery = metaCounts.pendingDeliveryCount > 0;
    if (chipAccept !== prev.chipAccept || chipDelivery !== prev.chipDelivery) {
      r2d1KpiMetaTrace({
        kind: "chip_render",
        pendingSummary,
        pendingMetaDerived,
        pendingDeliveryMeta: metaCounts.pendingDeliveryCount,
        source: "OwnerStoreOrdersView.chips",
        detail: `accept=${chipAccept},delivery=${chipDelivery}`,
      });
    }

    kpiTracePrevRef.current = {
      pendingSummary,
      pendingMeta: pendingMetaDerived,
      tabNew: tabBadges.new,
      tabProgress: tabBadges.progress,
      chipAccept,
      chipDelivery,
    };
  }, [state, summaryCounts, metaCounts, tabBadges, highlightOrderId]);

  useEffect(() => {
    if (state.kind !== "ok") return;
    if (searchParams.get("ack_owner_notifications") !== "1") return;
    if (ownerNotifAckRef.current) return;
    ownerNotifAckRef.current = true;
    void (async () => {
      try {
        await fetch("/api/me/notifications", {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mark_all_owner_store_commerce_read: true }),
        });
      } finally {
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event(KASAMA_NOTIFICATIONS_UPDATED));
        }
        const oid = searchParams.get("order_id")?.trim();
        const base = pathname ?? "/stores/owner/orders";
        const qs = oid ? `?order_id=${encodeURIComponent(oid)}` : "";
        router.replace(`${base}${qs}`, { scroll: false });
      }
    })();
  }, [state.kind, searchParams, pathname, router]);

  useRefetchOnPageShowRestore(() => void load({ silent: true, reason: "page_show_restore" }));

  const pollStoreId = state.kind === "ok" ? state.storeId : null;
  const pollStoreName = state.kind === "ok" ? state.storeName : "";

  const setOrdersForRealtime: Dispatch<
    SetStateAction<import("@/lib/store-owner/types").OwnerOrder[]>
  > =
    useCallback((action) => {
      setState((prev) => {
        if (prev.kind !== "ok") return prev;
        const ctx = {
          storeId: prev.storeId,
          storeSlug: storeListCtxRef.current.storeSlug,
          storeName: prev.storeName,
        };
        const prevOwner = prev.orders.map((r) => listRowToOwnerOrder(r, ctx));
        const nextOwner =
          typeof action === "function" ? action(prevOwner) : action;
        const orders = sortOwnerStoreOrderListRowsDesc(
          normalizeOwnerStoreOrderListRows(ownerOrdersToListRows(prev.orders, nextOwner))
        );
        return { ...prev, orders };
      });
    }, []);

  const enrichOrder = useCallback((orderId: string) => {
    const oid = orderId.trim();
    const storeId = alertStoreIdRef.current;
    if (!oid || !storeId) return;
    void runSingleFlight(`owner:store-order-enrich:${storeId}:${oid}`, async () => {
        const res = await fetch(
          `/api/me/stores/${encodeURIComponent(storeId)}/orders/${encodeURIComponent(oid)}`,
          { credentials: "include", cache: "no-store" }
        );
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          order?: OrderRow;
          delivery?: OrderRow["delivery"];
        };
        if (!json?.ok || !json.order) return;
        const parsed = parseOwnerStoreOrderListRowFromApi({
          ...json.order,
          delivery: json.delivery ?? undefined,
          buyer_public_label: json.order.buyer_public_label,
        });
        if (!parsed) return;
        setState((cur) => {
          if (cur.kind !== "ok") return cur;
          const idx = cur.orders.findIndex((o) => o.id === oid);
          const merged: OrderRow = {
            ...parsed,
            delivery: json.delivery ?? cur.orders[idx]?.delivery ?? null,
            buyer_public_label:
              cur.orders[idx]?.buyer_public_label ?? parsed.buyer_public_label,
            items:
              parsed.items.length > 0 ? parsed.items : (cur.orders[idx]?.items ?? []),
          };
          if (idx < 0) {
            return {
              ...cur,
              orders: sortOwnerStoreOrderListRowsDesc([merged, ...cur.orders]),
            };
          }
          const next = [...cur.orders];
          next[idx] = normalizeOwnerStoreOrderListRow({
            ...next[idx]!,
            ...merged,
          });
          return { ...cur, orders: sortOwnerStoreOrderListRowsDesc(next) };
        });
        r2d1OwnerOrdersTrace({
          kind: "row_patch_update",
          source: "OwnerStoreOrdersView.enrichOrder",
          owner: "OwnerStoreOrdersView",
          storeId,
          orderId: oid,
          fetchReason: "order_enrich_get",
        });
      });
  }, []);

  useEffect(() => {
    if (state.kind !== "ok" || !highlightOrderId) return;
    const order = state.orders.find((o) => o.id === highlightOrderId);
    if (!order) {
      if (!deepLinkEnrichAttemptedRef.current) {
        deepLinkEnrichAttemptedRef.current = true;
        enrichOrder(highlightOrderId);
      }
      return;
    }
    if (!orderMatchesStoreTab(order, tab)) {
      const wantTab = ownerOrdersUiTabForStatus(order.order_status);
      if (tab !== wantTab) {
        router.replace(
          buildStoreOrdersHref({
            storeId: state.storeId,
            tab: wantTab,
            orderId: highlightOrderId,
          }),
          { scroll: false }
        );
      }
    }
  }, [state, highlightOrderId, tab, router, enrichOrder]);

  useEffect(() => {
    if (state.kind !== "ok" || !highlightChatOrderId) return;
    const exists = state.orders.some((o) => o.id === highlightChatOrderId);
    if (!exists && !deepLinkChatEnrichAttemptedRef.current) {
      deepLinkChatEnrichAttemptedRef.current = true;
      enrichOrder(highlightChatOrderId);
    }
  }, [state, highlightChatOrderId, enrichOrder]);

  useOwnerStoreOrdersRealtime({
    storeId: pollStoreId,
    storeSlug: storeListCtxRef.current.storeSlug,
    storeName: pollStoreName,
    enabled: state.kind === "ok" && !!pollStoreId,
    debounceUpdateMs: 140,
    setOrders: setOrdersForRealtime,
    requestOrderEnrich: enrichOrder,
    onRealtimeInsert: (_orderId, row) => {
      if (String(row.fulfillment_type ?? "") !== "local_delivery") return;
      playDeliveryOrderAlertDebounced(alertStoreIdRef.current);
    },
  });

  const patchDeliveryFromRealtime = useCallback((ev: StoreOrderDeliveryRealtimeEvent) => {
    const oid = ev.orderId.trim();
    if (!oid) return;
    setState((prev) => {
      if (prev.kind !== "ok") return prev;
      const idx = prev.orders.findIndex((o) => o.id === oid);
      if (idx < 0) {
        r2d1OwnerOrdersTrace({
          kind: "delivery_row_patch_miss",
          source: "OwnerStoreOrdersView.patchDeliveryFromRealtime",
          owner: "OwnerStoreOrdersView",
          storeId: prev.storeId,
          orderId: oid,
          deliveryId: oid,
          eventType: ev.eventType,
          fetchReason: "order_not_in_list",
        });
        return prev;
      }
      const row = prev.orders[idx]!;
      const beforeDeliveryStatus = deliveryStatusOf(row.delivery);
      let nextDelivery = row.delivery;
      if (ev.eventType === "DELETE") {
        nextDelivery = null;
      } else if (ev.eventType === "INSERT" && ev.newRow) {
        nextDelivery = mapRealtimeRecordToOrderDelivery(ev.newRow);
      } else if (ev.eventType === "UPDATE" && ev.newRow) {
        nextDelivery = mergeRealtimeRecordIntoOrderDelivery(row.delivery, ev.newRow);
      }
      const afterDeliveryStatus = deliveryStatusOf(nextDelivery);
      const deliveryUnchanged =
        (row.delivery == null && nextDelivery == null) ||
        (row.delivery != null &&
          nextDelivery != null &&
          row.delivery.order_id === nextDelivery.order_id &&
          row.delivery.delivery_status === nextDelivery.delivery_status &&
          row.delivery.rider_id === nextDelivery.rider_id &&
          row.delivery.assigned_at === nextDelivery.assigned_at &&
          row.delivery.picked_up_at === nextDelivery.picked_up_at &&
          row.delivery.delivered_at === nextDelivery.delivered_at &&
          row.delivery.updated_at === nextDelivery.updated_at);
      if (deliveryUnchanged) return prev;

      const patchKind =
        ev.eventType === "INSERT"
          ? "delivery_row_patch_insert"
          : ev.eventType === "UPDATE"
            ? "delivery_row_patch_update"
            : "delivery_row_patch_delete";

      r2d1OwnerOrdersTrace({
        kind: patchKind,
        source: "OwnerStoreOrdersView.patchDeliveryFromRealtime",
        owner: "OwnerStoreOrdersView",
        storeId: prev.storeId,
        orderId: oid,
        deliveryId: oid,
        eventType: ev.eventType,
        fetchReason: "delivery_realtime_row_patch",
        beforeDeliveryStatus,
        afterDeliveryStatus,
        beforeCount: prev.orders.length,
        afterCount: prev.orders.length,
      });
      r2d1OwnerOrdersTrace({
        kind: "delivery_full_reload_blocked",
        source: "OwnerStoreOrdersView.patchDeliveryFromRealtime",
        owner: "OwnerStoreOrdersView",
        storeId: prev.storeId,
        orderId: oid,
        deliveryId: oid,
        fetchReason: "skipped_load_realtime_deliveries",
      });

      const orders = [...prev.orders];
      orders[idx] = normalizeOwnerStoreOrderListRow({ ...row, delivery: nextDelivery });
      return { ...prev, orders };
    });
  }, []);

  useSupabaseStoreOrderDeliveriesRealtime(
    pollStoreId ? { kind: "store", storeId: pollStoreId } : null,
    { onDeliveryEvent: patchDeliveryFromRealtime }
  );

  useEffect(() => {
    if (!pollStoreId) return;
    let inFlight = false;
    const safeSilentLoad = (reason: "poll_45s" | "visibility_visible") => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      if (inFlight) return;
      inFlight = true;
      void load({ silent: true, reason }).finally(() => {
        inFlight = false;
      });
    };
    let intervalId: number | null = null;
    const stopPoll = () => {
      if (intervalId == null) return;
      window.clearInterval(intervalId);
      intervalId = null;
    };
    const startPoll = () => {
      stopPoll();
      intervalId = window.setInterval(() => safeSilentLoad("poll_45s"), 45_000);
    };
    const onVisibility = () => {
      if (typeof document === "undefined") return;
      if (document.visibilityState === "visible") {
        safeSilentLoad("visibility_visible");
        startPoll();
      } else {
        stopPoll();
      }
    };
    if (typeof document === "undefined" || document.visibilityState === "visible") {
      startPoll();
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stopPoll();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [pollStoreId, load]);

  const onTabHref = useCallback(
    (tabId: StoreOrderTabId) => {
      if (state.kind !== "ok") return "#";
      return buildStoreOrdersHref({
        storeId: state.storeId,
        tab: tabId,
        orderId: highlightOrderId || undefined,
      });
    },
    [state, highlightOrderId]
  );

  const onOpenDetail = useCallback(
    (orderId: string) => {
      if (state.kind !== "ok") return;
      const row = state.orders.find((o) => o.id === orderId);
      const open = () => router.push(buildStoreOrdersHref({ storeId: state.storeId, tab, orderId }));
      if (row?.order_status !== "pending") {
        open();
        return;
      }
      void (async () => {
        const res = await patchOwnerStoreOrderStatus(state.storeId, orderId, {
          order_status: "accepted",
          estimated_prep_minutes: OWNER_AUTO_ACCEPT_PREP_MINUTES,
        });
        if (res.ok) await load();
        open();
      })();
    },
    [load, router, state, tab]
  );

  const onCloseDetail = useCallback(() => {
    if (state.kind !== "ok") return;
    router.replace(buildStoreOrdersHref({ storeId: state.storeId, tab }));
  }, [router, state, tab]);

  const onOpenChat = useCallback(
    (orderId: string) => {
      if (state.kind !== "ok") return;
      router.push(buildStoreOrdersHref({ storeId: state.storeId, tab, chatOrderId: orderId }));
    },
    [router, state, tab]
  );

  const onCloseChat = useCallback(() => {
    if (state.kind !== "ok") return;
    router.replace(buildStoreOrdersHref({ storeId: state.storeId, tab }));
  }, [router, state, tab]);

  let body: ReactNode;
  if (state.kind === "loading") {
    body = (
      <p className="px-3 py-8 text-center text-sm text-[#8C8C8C]">불러오는 중…</p>
    );
  } else if (state.kind === "unauth") {
    body = (
      <div className="mx-3 mt-4 rounded-lg border border-[#E8E8E8] bg-white p-6">
        <p className="text-sm text-[#595959]">로그인 후 매장 주문을 확인할 수 있습니다.</p>
        <Link
          href={loginHref}
          className="mt-3 inline-flex rounded-md bg-[#2D7FF9] px-4 py-2 font-semibold text-white"
        >
          로그인하고 주문 보기
        </Link>
      </div>
    );
  } else if (state.kind === "config") {
    body = <p className="px-3 py-8 text-center text-sm text-[#8C8C8C]">서버 설정을 확인해 주세요.</p>;
  } else if (state.kind === "no_store") {
    body = (
      <div className="mx-3 mt-4 rounded-lg border border-[#E8E8E8] bg-white p-6">
        <p className="text-sm text-[#595959]">등록된 매장이 없습니다.</p>
        <Link href="/stores/owner/apply" className="mt-2 inline-block text-[#2D7FF9] font-medium">
          매장 신청
        </Link>
      </div>
    );
  } else if (state.kind === "error") {
    body = (
      <div className="px-3 py-8 text-center">
        <p className="text-sm text-[#FF4D4F]">({state.message})</p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-2 text-sm font-medium text-[#2D7FF9] underline"
        >
          다시 시도
        </button>
      </div>
    );
  } else {
    body = null;
  }

  if (state.kind === "ok") {
    return (
      <OwnerStoreOrdersMobileBody
        storeId={state.storeId}
        storeName={state.storeName}
        orders={state.orders}
        tab={tab}
        highlightOrderId={highlightOrderId}
        highlightChatOrderId={highlightChatOrderId}
        summaryCounts={summaryCounts}
        onTabHref={onTabHref}
        onUpdated={() => load({ silent: true, reason: "order_status_patch" })}
        onOrderStatusPatched={(orderId) => enrichOrder(orderId)}
        onOpenDetail={onOpenDetail}
        onCloseDetail={onCloseDetail}
        onOpenChat={onOpenChat}
        onCloseChat={onCloseChat}
      />
    );
  }

  return <div className="min-h-[40vh] bg-[#F3F4F6]">{body}</div>;
}
