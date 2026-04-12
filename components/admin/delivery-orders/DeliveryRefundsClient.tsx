"use client";

import { useMemo, useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import {
  approveRefund,
  listRefundPendingOrders,
  rejectRefund,
} from "@/lib/admin/delivery-orders-mock/mock-store";
import { useDeliveryMockVersion } from "@/lib/admin/delivery-orders-mock/use-delivery-mock-store";
import { RefundRequestTable } from "./RefundRequestTable";
import { RefundDecisionModal } from "./RefundDecisionModal";

export function DeliveryRefundsClient() {
  const v = useDeliveryMockVersion();
  const rows = useMemo(() => {
    void v;
    return listRefundPendingOrders();
  }, [v]);

  const [modal, setModal] = useState<null | { mode: "approve" | "reject"; orderId: string }>(null);
  const [toast, setToast] = useState<string | null>(null);

  const show = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  };

  return (
    <div className="p-4 md:p-6">
      <AdminPageHeader title="환불 요청" backHref="/admin/delivery-orders" />
      {toast ? <p className="mb-2 text-sm text-sam-fg">{toast}</p> : null}
      <AdminCard title="대기 목록 (mock)">
        <RefundRequestTable
          rows={rows}
          onApprove={(orderId) => setModal({ mode: "approve", orderId })}
          onReject={(orderId) => setModal({ mode: "reject", orderId })}
        />
      </AdminCard>

      <RefundDecisionModal
        open={!!modal}
        mode={modal?.mode ?? "approve"}
        onClose={() => setModal(null)}
        onConfirm={(memo) => {
          if (!modal) return;
          const r =
            modal.mode === "approve"
              ? approveRefund(modal.orderId, memo)
              : rejectRefund(modal.orderId, memo);
          show(r.ok ? "처리됨" : r.error ?? "실패");
        }}
      />
    </div>
  );
}
