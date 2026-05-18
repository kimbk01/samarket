"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { OwnerOrderCard } from "@/components/stores/owner/OwnerOrderCard";
import { OwnerOrderStatusBadge } from "@/components/stores/owner/OwnerOrderStatusBadge";
import { filterOwnerOrdersByTab } from "@/lib/store-owner/owner-order-filters";
import { fetchOwnerOrderRemote, fetchOwnerOrdersRemote } from "@/lib/store-owner/owner-order-remote";
import type { OwnerOrder, OwnerOrderTab } from "@/lib/store-owner/types";
import { useMeStoreBySlug } from "@/hooks/useMeStoreBySlug";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { useRefetchOnPageShowRestore } from "@/lib/ui/use-refetch-on-page-show";
import {
  dibayPerfOnOwnerOrdersVisible,
  dibayPerfRecordOwnerOrderFullReloadFallback,
  dibayPerfRecordOwnerOrderRowPatched,
} from "@/lib/dibay/delivery-flow-perf";
import { r2d1OwnerOrdersTrace, r2d1OwnerOrdersTraceInstallCollector } from "@/lib/dibay/r2-d1-owner-orders-trace";
import { useOwnerStoreOrdersRealtime, sortOwnerOrdersDesc } from "@/hooks/stores/useOwnerStoreOrdersRealtime";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { resolveOwnerApiErrorMessage } from "@/lib/business/owner-api-error-i18n";
import { ownerOrderTabLabel } from "@/lib/stores/owner-order-ui-labels";

type Props = {
  slug: string;
};

function mergeOwnerOrdersWithServer(prev: OwnerOrder[], server: OwnerOrder[]): OwnerOrder[] {
  const byId = new Map(server.map((o) => [o.id, o]));
  for (const o of prev) {
    if (!byId.has(o.id)) byId.set(o.id, o);
  }
  return sortOwnerOrdersDesc([...byId.values()]);
}

export function OwnerOrdersPageClient({ slug }: Props) {
  const { t, language } = useI18n();
  const { state: gate } = useMeStoreBySlug(slug);
  const [tab, setTab] = useState<OwnerOrderTab>("active");
  const [orders, setOrders] = useState<OwnerOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const ownerListPerfRef = useRef(false);
  const [highlightIds, setHighlightIds] = useState<Set<string>>(() => new Set());
  const highlightTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const storeId = gate.kind === "ok" ? gate.store.id : null;
  const storeName = gate.kind === "ok" ? gate.store.store_name : "";
  const safeSlug = decodeURIComponent(slug || "").trim();

  const scheduleHighlight = useCallback((id: string) => {
    const oid = id.trim();
    if (!oid) return;
    setHighlightIds((prev) => new Set(prev).add(oid));
    const prevT = highlightTimersRef.current.get(oid);
    if (prevT) clearTimeout(prevT);
    const t = setTimeout(() => {
      highlightTimersRef.current.delete(oid);
      setHighlightIds((prev) => {
        const n = new Set(prev);
        n.delete(oid);
        return n;
      });
    }, 12_000);
    highlightTimersRef.current.set(oid, t);
  }, []);

  useEffect(() => {
    return () => {
      for (const t of highlightTimersRef.current.values()) clearTimeout(t);
      highlightTimersRef.current.clear();
    };
  }, []);

  const enrichOrder = useCallback(
    (orderId: string) => {
      if (!storeId) return;
      const oid = orderId.trim();
      if (!oid) return;
      void runSingleFlight(`owner:order-enrich:${storeId}:${oid}`, async () => {
        const r = await fetchOwnerOrderRemote(storeId, oid, {
          storeSlug: safeSlug,
          storeName,
        });
        if (!r.ok) return;
        setOrders((prev) => {
          const idx = prev.findIndex((o) => o.id === oid);
          if (idx < 0) return sortOwnerOrdersDesc([r.order, ...prev]);
          const next = [...prev];
          next[idx] = r.order;
          return sortOwnerOrdersDesc(next);
        });
        dibayPerfRecordOwnerOrderRowPatched(storeId, oid);
      });
    },
    [storeId, safeSlug, storeName]
  );

  const fetchOrdersOnce = useCallback(async (): Promise<void> => {
    if (!storeId) return;
    r2d1OwnerOrdersTrace({
      kind: "full_reload",
      source: "OwnerOrdersPageClient.fetchOrdersOnce",
      owner: "OwnerOrdersPageClient",
      storeId,
      fetchReason: "list_get",
    });
    setLoading(true);
    setError(null);
    try {
      const r = await fetchOwnerOrdersRemote(storeId, { storeSlug: safeSlug, storeName });
      if (!r.ok) {
        setError(r.error);
        setOrders([]);
        return;
      }
      setOrders((prev) => mergeOwnerOrdersWithServer(prev, r.orders));
    } catch (e) {
      setError(e instanceof Error ? e.message : "load_failed");
    } finally {
      setLoading(false);
    }
  }, [storeId, safeSlug, storeName]);

  const load = useCallback(() => {
    if (!storeId) return Promise.resolve();
    return runSingleFlight(`owner:orders:list:${storeId}`, fetchOrdersOnce);
  }, [storeId, fetchOrdersOnce]);

  useEffect(() => {
    r2d1OwnerOrdersTraceInstallCollector();
    void load();
  }, [load]);

  useRefetchOnPageShowRestore(() => void load());

  useOwnerStoreOrdersRealtime({
    storeId,
    storeSlug: safeSlug,
    storeName,
    enabled: gate.kind === "ok" && !!storeId,
    debounceUpdateMs: 140,
    setOrders,
    requestOrderEnrich: enrichOrder,
    onRealtimeInsert: (orderId) => scheduleHighlight(orderId),
  });

  useLayoutEffect(() => {
    if (gate.kind !== "ok" || !storeId || loading) return;
    if (ownerListPerfRef.current) return;
    ownerListPerfRef.current = true;
    dibayPerfOnOwnerOrdersVisible(storeId);
  }, [gate.kind, storeId, loading]);

  useEffect(() => {
    ownerListPerfRef.current = false;
  }, [safeSlug]);

  const filtered = useMemo(() => filterOwnerOrdersByTab(orders, tab), [orders, tab]);

  if (gate.kind === "loading" || gate.kind === "idle") {
    return <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-6 text-sm text-sam-muted">{t("common_loading")}</div>;
  }
  if (gate.kind === "unauth") {
    return (
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-6 text-sm text-sam-fg">
        {t("common_login_required")}{" "}
        <Link className="font-bold text-sam-fg underline" href="/login">
          {t("common_login")}
        </Link>
      </div>
    );
  }
  if (gate.kind === "not_owner") {
    return (
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-6 text-sm text-sam-fg">
        {t("store_owner_no_permission")}
      </div>
    );
  }
  if (gate.kind === "error") {
    return (
      <div className="rounded-ui-rect border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800">
        {t("store_owner_store_load_failed")} ({gate.message})
      </div>
    );
  }

  if (gate.kind !== "ok") {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-sam-muted">{t("business_phase7_274")}</div>
        <button
          type="button"
          onClick={() => {
            if (storeId) dibayPerfRecordOwnerOrderFullReloadFallback(storeId);
            void load();
          }}
          className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 text-xs font-bold text-sam-fg hover:bg-sam-app"
        >
          {t("store_owner_refresh")}
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {(["active", "done", "issue"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab((prev) => (prev === k ? prev : k))}
            className={`rounded-full px-3 py-1.5 text-xs font-bold ring-1 ring-inset ${
              tab === k ? "bg-sam-ink text-white ring-sam-border" : "bg-sam-surface text-sam-fg ring-sam-border hover:bg-sam-app"
            }`}
          >
            {k === "issue" ? t("store_owner_tab_issue_short") : ownerOrderTabLabel(k, language)}
          </button>
        ))}
      </div>

      {error ? (
        <div className="rounded-ui-rect border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          {resolveOwnerApiErrorMessage(error, t)}
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-6 text-sm text-sam-muted">{t("business_phase7_262")}</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-6 text-sm text-sam-muted">{t("business_phase7_316")}</div>
      ) : (
        <div className="space-y-3">
          {filtered.map((o) => (
            <OwnerOrderCard
              key={o.id}
              storeId={gate.store.id}
              slug={safeSlug}
              order={o}
              highlight={highlightIds.has(o.id)}
              onActionDone={() => enrichOrder(o.id)}
            />
          ))}
        </div>
      )}

      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 text-xs text-sam-muted">
        <div className="font-bold text-sam-fg">{t("business_phase7_148")}</div>
        <div className="mt-2 flex flex-wrap gap-2">
          {(
            [
              "pending",
              "accepted",
              "preparing",
              "ready_for_pickup",
              "delivering",
              "arrived",
              "completed",
              "cancel_requested",
              "cancelled",
              "refund_requested",
              "refunded",
            ] as const
          ).map((s) => (
            <OwnerOrderStatusBadge key={s} status={s} />
          ))}
        </div>
      </div>
    </div>
  );
}
