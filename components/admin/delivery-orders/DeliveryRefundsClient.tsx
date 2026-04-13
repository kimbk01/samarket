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
import { RefundRequestTable } from "./RefundRequestTable";

export function DeliveryRefundsClient() {
  const [rows, setRows] = useState<AdminDeliveryOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const show = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { status, json } = await fetchAdminStoreOrdersByOrderStatus("refund_requested");
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

  const approve = async (orderId: string) => {
    if (
      !window.confirm(
        "환불을 승인할까요? 주문이 refunded로 바뀌고 재고가 복구되며 예정 정산이 취소될 수 있습니다."
      )
    ) {
      return;
    }
    setBusyId(orderId);
    try {
      const res = await fetch(`/api/admin/store-orders/${encodeURIComponent(orderId)}/approve-refund`, {
        method: "POST",
        credentials: "include",
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!json?.ok) {
        show(json.error ?? "승인 실패");
        return;
      }
      show("환불 승인을 반영했습니다.");
      await load();
    } catch {
      show("네트워크 오류");
    } finally {
      setBusyId(null);
    }
  };

  const reject = (orderId: string) => {
    window.location.assign(`/admin/store-orders?order_id=${encodeURIComponent(orderId)}`);
  };

  return (
    <div className="p-4 md:p-6">
      <AdminPageHeader title="환불 요청" backHref="/admin/delivery-orders" />
      <p className="mb-2 text-[13px] text-sam-muted">
        <code className="rounded bg-sam-app px-1 text-[12px]">order_status = refund_requested</code> 원장만
        표시합니다. 승인은 DB API로 처리하고, 거절·기타 조정은{" "}
        <Link href="/admin/store-orders" className="text-signature underline">
          매장 주문(액션)
        </Link>
        에서 이어가세요.
      </p>
      {toast ? <p className="mb-2 text-sm text-sam-fg">{toast}</p> : null}
      {error ? (
        <p className="mb-3 rounded-ui-rect border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-950">
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
      <AdminCard title="대기 목록 (원장)">
        {loading ? (
          <p className="text-sm text-sam-muted">불러오는 중…</p>
        ) : (
          <RefundRequestTable
            rows={rows}
            busyOrderId={busyId}
            onApprove={(id) => void approve(id)}
            onReject={reject}
          />
        )}
      </AdminCard>
    </div>
  );
}
