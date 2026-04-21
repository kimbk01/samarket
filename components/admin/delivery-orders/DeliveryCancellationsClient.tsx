"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import {
  fetchAdminStoreOrdersByOrderStatus,
  parseAdminStoreOrdersResponse,
} from "@/lib/admin/fetch-admin-store-orders-scoped";
import type { AdminDeliveryOrder } from "@/lib/admin/delivery-orders-admin/types";
import { CancelRequestTable } from "./CancelRequestTable";

export function DeliveryCancellationsClient() {
  const [rows, setRows] = useState<AdminDeliveryOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { status, json } = await fetchAdminStoreOrdersByOrderStatus("cancelled");
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
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="p-4 md:p-6">
      <AdminPageHeader title="취소 주문" backHref="/admin/delivery-orders" />
      <p className="mb-2 sam-text-body-secondary text-sam-muted">
        DB 스키마상 취소 단계는{" "}
        <code className="rounded bg-sam-app px-1 sam-text-helper">cancelled</code> 로 확정된 건만 조회합니다. 추가
        처리는{" "}
        <Link href="/admin/store-orders" className="text-signature underline">
          매장 주문(액션)
        </Link>
        과 주문 상세에서 진행하세요.
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
      <AdminCard title="취소 완료 (원장 · 최근 최대 500건)">
        {loading ? (
          <p className="text-sm text-sam-muted">불러오는 중…</p>
        ) : (
          <CancelRequestTable
            rows={rows}
            showWorkflowActions={false}
            onApprove={() => {}}
            onReject={() => {}}
          />
        )}
      </AdminCard>
    </div>
  );
}
