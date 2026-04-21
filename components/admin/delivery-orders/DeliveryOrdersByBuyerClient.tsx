"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import {
  fetchAdminStoreOrdersForBuyer,
  parseAdminStoreOrdersResponse,
} from "@/lib/admin/fetch-admin-store-orders-scoped";
import type { AdminDeliveryOrder } from "@/lib/admin/delivery-orders-admin/types";
import { OrderTable } from "./OrderTable";

export function DeliveryOrdersByBuyerClient({ buyerUserId }: { buyerUserId: string }) {
  const [rows, setRows] = useState<AdminDeliveryOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { status, json } = await fetchAdminStoreOrdersForBuyer(buyerUserId);
      const j = json as { ok?: boolean; error?: string };
      if (status < 200 || status >= 300 || j.ok === false) {
        setRows([]);
        setError(typeof j.error === "string" ? j.error : `HTTP ${status}`);
        return;
      }
      setRows(parseAdminStoreOrdersResponse(json));
    } catch {
      setRows([]);
      setError("network_error");
    } finally {
      setLoading(false);
    }
  }, [buyerUserId]);

  useEffect(() => {
    void load();
  }, [load]);

  const label = rows[0]?.buyerName?.trim() || buyerUserId;

  return (
    <div className="p-4 md:p-6">
      <AdminPageHeader title={`회원 주문 이력 · ${label}`} backHref="/admin/delivery-orders" />
      <p className="mb-2 text-xs text-sam-muted">
        buyerUserId: <span className="font-mono">{buyerUserId}</span> ·{" "}
        <Link
          href={`/admin/chats/messenger?q=${encodeURIComponent(buyerUserId)}`}
          className="text-signature underline"
        >
          메신저 검색
        </Link>
      </p>
      {error ? (
        <p className="mb-3 rounded-ui-rect border border-amber-200 bg-amber-50 px-3 py-2 sam-text-helper text-amber-950">
          불러오지 못했습니다 ({error}).
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
      <AdminCard title="주문 목록 (store_orders 원장 · 최대 500건)">
        {loading ? (
          <p className="text-sm text-sam-muted">불러오는 중…</p>
        ) : (
          <OrderTable rows={rows} />
        )}
      </AdminCard>
    </div>
  );
}
