"use client";

import { useState } from "react";
import Link from "next/link";
import type { OrderReport } from "@/lib/admin/delivery-orders-mock/types";
import { holdSettlement, updateReportStatus } from "@/lib/admin/delivery-orders-mock/mock-store";
import { useDeliveryMockVersion } from "@/lib/admin/delivery-orders-mock/use-delivery-mock-store";
import { DeliveryReasonModal } from "./DeliveryReasonModal";

export function DisputeActionPanel({ report }: { report: OrderReport | null }) {
  const v = useDeliveryMockVersion();
  void v;
  const [toast, setToast] = useState<string | null>(null);
  const [modal, setModal] = useState<"hold" | "memo" | null>(null);

  const show = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  };

  if (!report) return null;

  return (
    <div className="rounded-ui-rect border border-amber-200 bg-amber-50/40 p-3 text-sm">
      <p className="font-semibold text-sam-fg">분쟁 조치</p>
      {toast ? <p className="mt-2 text-xs text-sam-fg">{toast}</p> : null}
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded bg-sam-surface px-2 py-1 text-xs ring-1 ring-sam-border"
          onClick={() => {
            updateReportStatus(report.id, { status: "reviewing", adminResult: "검토중으로 변경 (mock)" });
            show("상태: 검토중");
          }}
        >
          검토중
        </button>
        <button
          type="button"
          className="rounded bg-sam-surface px-2 py-1 text-xs ring-1 ring-sam-border"
          onClick={() => {
            updateReportStatus(report.id, { status: "resolved", adminResult: report.adminResult ?? "처리완료 (mock)" });
            show("처리완료");
          }}
        >
          처리완료
        </button>
        <button
          type="button"
          className="rounded bg-sam-surface px-2 py-1 text-xs ring-1 ring-sam-border"
          onClick={() => {
            updateReportStatus(report.id, { status: "rejected", adminResult: "신고 반려 (mock)" });
            show("반려 처리");
          }}
        >
          신고 반려
        </button>
        <Link
          href={`/admin/delivery-orders/${encodeURIComponent(report.orderId)}`}
          className="rounded bg-sam-surface px-2 py-1 text-xs text-sam-fg ring-1 ring-sam-border"
        >
          환불 검토(주문)
        </Link>
        <button
          type="button"
          className="rounded bg-sam-surface px-2 py-1 text-xs text-orange-800 ring-1 ring-orange-200"
          onClick={() => setModal("hold")}
        >
          매장 정산 보류
        </button>
        <button
          type="button"
          className="rounded bg-sam-surface px-2 py-1 text-xs ring-1 ring-sam-border"
          onClick={() => setModal("memo")}
        >
          조치 메모
        </button>
      </div>

      <DeliveryReasonModal
        open={modal === "hold"}
        title="연결 주문 정산 보류"
        label="보류 사유 (필수)"
        confirmLabel="보류"
        required
        onClose={() => setModal(null)}
        onConfirm={(reason) => {
          const r = holdSettlement(report.orderId, reason);
          show(r.ok ? "정산 보류 반영" : r.error ?? "실패");
        }}
      />

      <DeliveryReasonModal
        open={modal === "memo"}
        title="조치결과 메모"
        label="관리자 조치 메모"
        confirmLabel="저장"
        onClose={() => setModal(null)}
        onConfirm={(text) => {
          updateReportStatus(report.id, { adminResult: text });
          show("메모 저장 (mock)");
        }}
      />
    </div>
  );
}
