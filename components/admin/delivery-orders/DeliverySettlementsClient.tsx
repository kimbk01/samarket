"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { fetchAdminStoreOrdersListDeduped } from "@/lib/admin/fetch-admin-store-orders-deduped";
import type { AdminDeliveryOrder } from "@/lib/admin/delivery-orders-admin/types";
import { parseAdminStoreOrdersResponse } from "@/lib/admin/fetch-admin-store-orders-scoped";
import { SettlementFilterBar, type SettlementListFilters } from "./SettlementFilterBar";
import { SettlementTable } from "./SettlementTable";

const defaultFilters: SettlementListFilters = {
  settlementStatus: "",
  storeQuery: "",
  heldOnly: false,
};

function filterRows(all: AdminDeliveryOrder[], f: SettlementListFilters): AdminDeliveryOrder[] {
  return all.filter((o) => {
    if (f.settlementStatus && o.settlementStatus !== f.settlementStatus) return false;
    if (f.heldOnly && o.settlementStatus !== "held") return false;
    if (f.storeQuery.trim() && !o.storeName.toLowerCase().includes(f.storeQuery.trim().toLowerCase()))
      return false;
    return true;
  });
}

export function DeliverySettlementsClient() {
  const [filters, setFilters] = useState<SettlementListFilters>(defaultFilters);
  const [orders, setOrders] = useState<AdminDeliveryOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { status, json } = await fetchAdminStoreOrdersListDeduped();
      const j = json as { ok?: boolean; error?: string };
      if (status < 200 || status >= 300 || j.ok === false) {
        setOrders([]);
        setError(typeof j.error === "string" ? j.error : `HTTP ${status}`);
        return;
      }
      setOrders(parseAdminStoreOrdersResponse(json));
    } catch {
      setOrders([]);
      setError("network_error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => filterRows(orders, filters), [orders, filters]);

  return (
    <div className="p-4 md:p-6">
      <AdminPageHeader title="정산 관리" backHref="/admin/delivery-orders" />
      <p className="mb-2 sam-text-body-secondary text-sam-muted">
        주문 단위 정산 스냅샷은 원장 매핑 기준이며, 실제 지급·보류는{" "}
        <Link href="/admin/store-settlements" className="text-signature underline">
          매장 정산
        </Link>
        과 동일 DB를 참고하세요. 환불·목록 액션은{" "}
        <Link href="/admin/store-orders" className="text-signature underline">
          매장 주문(액션)
        </Link>
        에서 처리합니다.
      </p>
      {error ? (
        <p className="mb-3 rounded-ui-rect border border-amber-200 bg-amber-50 px-3 py-2 sam-text-helper text-amber-950">
          목록을 불러오지 못했습니다 ({error}).
        </p>
      ) : null}
      <div className="mb-2">
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="rounded-ui-rect border border-sam-border px-3 py-1.5 text-xs text-sam-fg disabled:opacity-50"
        >
          {loading ? "갱신 중…" : "새로고침"}
        </button>
      </div>
      <SettlementFilterBar filters={filters} onChange={setFilters} />
      <div className="mt-4">
        <AdminCard title="정산 행 (주문 단위 · 최대 500건)">
          {loading ? <p className="text-sm text-sam-muted">불러오는 중…</p> : <SettlementTable rows={rows} />}
        </AdminCard>
      </div>
    </div>
  );
}
