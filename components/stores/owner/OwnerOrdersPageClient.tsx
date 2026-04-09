"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { OwnerOrderCard } from "@/components/stores/owner/OwnerOrderCard";
import { OwnerOrderStatusBadge } from "@/components/stores/owner/OwnerOrderStatusBadge";
import { filterOwnerOrdersByTab } from "@/lib/store-owner/owner-order-filters";
import { fetchOwnerOrdersRemote } from "@/lib/store-owner/owner-order-remote";
import type { OwnerOrder, OwnerOrderTab } from "@/lib/store-owner/types";
import { useMeStoreBySlug } from "@/hooks/useMeStoreBySlug";

type Props = {
  slug: string;
};

export function OwnerOrdersPageClient({ slug }: Props) {
  const { state: gate } = useMeStoreBySlug(slug);
  const [tab, setTab] = useState<OwnerOrderTab>("active");
  const [orders, setOrders] = useState<OwnerOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const storeId = gate.kind === "ok" ? gate.store.id : null;
  const storeName = gate.kind === "ok" ? gate.store.store_name : "";
  const safeSlug = decodeURIComponent(slug || "").trim();

  const load = useCallback(async () => {
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
      setOrders(r.orders);
    } catch (e) {
      setError(e instanceof Error ? e.message : "load_failed");
    } finally {
      setLoading(false);
    }
  }, [storeId, safeSlug, storeName]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => filterOwnerOrdersByTab(orders, tab), [orders, tab]);

  if (gate.kind === "loading" || gate.kind === "idle") {
    return <div className="rounded-ui-rect border border-gray-200 bg-white p-6 text-sm text-gray-600">불러오는 중…</div>;
  }
  if (gate.kind === "unauth") {
    return (
      <div className="rounded-ui-rect border border-gray-200 bg-white p-6 text-sm text-gray-700">
        로그인이 필요합니다.{" "}
        <Link className="font-bold text-gray-900 underline" href="/login">
          로그인
        </Link>
      </div>
    );
  }
  if (gate.kind === "not_owner") {
    return (
      <div className="rounded-ui-rect border border-gray-200 bg-white p-6 text-sm text-gray-700">
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
        <div className="text-sm text-gray-600">주문을 확인하고 상태를 변경할 수 있습니다.</div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-ui-rect border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-900 hover:bg-gray-50"
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
            onClick={() => setTab(k)}
            className={`rounded-full px-3 py-1.5 text-xs font-bold ring-1 ring-inset ${
              tab === k ? "bg-gray-900 text-white ring-gray-900" : "bg-white text-gray-800 ring-gray-200 hover:bg-gray-50"
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
        <div className="rounded-ui-rect border border-gray-200 bg-white p-6 text-sm text-gray-600">주문 불러오는 중…</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-ui-rect border border-gray-200 bg-white p-6 text-sm text-gray-600">표시할 주문이 없습니다.</div>
      ) : (
        <div className="space-y-3">
          {filtered.map((o) => (
            <OwnerOrderCard
              key={o.id}
              storeId={gate.store.id}
              slug={safeSlug}
              order={o}
              onActionDone={() => void load()}
            />
          ))}
        </div>
      )}

      <div className="rounded-ui-rect border border-gray-200 bg-white p-4 text-xs text-gray-600">
        <div className="font-bold text-gray-900">상태 안내</div>
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
