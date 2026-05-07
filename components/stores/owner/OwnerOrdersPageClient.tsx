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
import { useOwnerStoreOrdersRealtime, sortOwnerOrdersDesc } from "@/hooks/stores/useOwnerStoreOrdersRealtime";

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
    onRealtimeInsert: scheduleHighlight,
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
    return <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-6 text-sm text-sam-muted">불러오는 중…</div>;
  }
  if (gate.kind === "unauth") {
    return (
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-6 text-sm text-sam-fg">
        로그인이 필요합니다.{" "}
        <Link className="font-bold text-sam-fg underline" href="/login">
          로그인
        </Link>
      </div>
    );
  }
  if (gate.kind === "not_owner") {
    return (
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-6 text-sm text-sam-fg">
        이 매장에 대한 오너 권한이 없습니다.
      </div>
    );
  }
  if (gate.kind === "error") {
    return (
      <div className="rounded-ui-rect border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800">
        매장 정보를 불러오지 못했습니다. ({gate.message})
      </div>
    );
  }

  if (gate.kind !== "ok") {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-sam-muted">주문을 확인하고 상태를 변경할 수 있습니다.</div>
        <button
          type="button"
          onClick={() => {
            if (storeId) dibayPerfRecordOwnerOrderFullReloadFallback(storeId);
            void load();
          }}
          className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 text-xs font-bold text-sam-fg hover:bg-sam-app"
        >
          새로고침
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["active", "진행중"],
            ["done", "완료"],
            ["issue", "취소·환불"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab((prev) => (prev === k ? prev : k))}
            className={`rounded-full px-3 py-1.5 text-xs font-bold ring-1 ring-inset ${
              tab === k ? "bg-sam-ink text-white ring-sam-border" : "bg-sam-surface text-sam-fg ring-sam-border hover:bg-sam-app"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {error ? (
        <div className="rounded-ui-rect border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div>
      ) : null}

      {loading ? (
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-6 text-sm text-sam-muted">주문 불러오는 중…</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-6 text-sm text-sam-muted">표시할 주문이 없습니다.</div>
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
        <div className="font-bold text-sam-fg">상태 안내</div>
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
