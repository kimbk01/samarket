"use client";

import { useMemo, useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import {
  approveCancelRequest,
  listCancelPendingOrders,
  rejectCancelRequest,
} from "@/lib/admin/delivery-orders-mock/mock-store";
import { useDeliveryMockVersion } from "@/lib/admin/delivery-orders-mock/use-delivery-mock-store";
import { CancelRequestTable } from "./CancelRequestTable";
import { DeliveryReasonModal } from "./DeliveryReasonModal";

export function DeliveryCancellationsClient() {
  const v = useDeliveryMockVersion();
  const rows = useMemo(() => {
    void v;
    return listCancelPendingOrders();
  }, [v]);

  const [modal, setModal] = useState<null | { kind: "approve" | "reject"; orderId: string }>(null);
  const [toast, setToast] = useState<string | null>(null);

  const show = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  };

  return (
    <div className="p-4 md:p-6">
      <AdminPageHeader title="취소 요청" backHref="/admin/delivery-orders" />
      {toast ? <p className="mb-2 text-sm text-sam-fg">{toast}</p> : null}
      <AdminCard title="대기 목록 (mock)">
        <CancelRequestTable
          rows={rows}
          onApprove={(orderId) => setModal({ kind: "approve", orderId })}
          onReject={(orderId) => setModal({ kind: "reject", orderId })}
        />
      </AdminCard>

      <DeliveryReasonModal
        open={modal?.kind === "approve"}
        title="취소 요청 승인"
        label="처리 메모 (선택)"
        confirmLabel="승인"
        onClose={() => setModal(null)}
        onConfirm={(memo) => {
          if (modal?.kind !== "approve") return;
          const r = approveCancelRequest(modal.orderId, memo);
          show(r.ok ? "취소 승인됨" : r.error ?? "실패");
        }}
      />
      <DeliveryReasonModal
        open={modal?.kind === "reject"}
        title="취소 요청 거절"
        label="거절 사유 (필수)"
        confirmLabel="거절"
        required
        onClose={() => setModal(null)}
        onConfirm={(memo) => {
          if (modal?.kind !== "reject") return;
          const r = rejectCancelRequest(modal.orderId, memo);
          show(r.ok ? "거절 처리됨" : r.error ?? "실패");
        }}
      />
    </div>
  );
}
