"use client";

import type { OrderReport } from "@/lib/admin/delivery-orders-admin/types";

const STATUS_KO: Record<OrderReport["status"], string> = {
  open: "접수",
  reviewing: "검토중",
  resolved: "처리완료",
  rejected: "반려",
};

export function OrderReportTable({
  rows,
  orderNoById,
  storeNameByOrderId,
  selectedId,
  onSelect,
}: {
  rows: OrderReport[];
  orderNoById: Record<string, string>;
  storeNameByOrderId: Record<string, string>;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-sam-muted">접수된 신고가 없습니다.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table className="w-full min-w-[920px] border-collapse sam-text-body-secondary">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app text-left text-xs font-medium text-sam-muted">
            <th className="px-2 py-2">신고번호</th>
            <th className="px-2 py-2">주문번호</th>
            <th className="px-2 py-2">신고자</th>
            <th className="px-2 py-2">매장</th>
            <th className="px-2 py-2">유형</th>
            <th className="px-2 py-2">접수일</th>
            <th className="px-2 py-2">상태</th>
            <th className="px-2 py-2">조치</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const active = selectedId === r.id;
            return (
              <tr
                key={r.id}
                className={`cursor-pointer border-b border-sam-border-soft ${active ? "bg-amber-50/80" : "hover:bg-sam-app/80"}`}
                onClick={() => onSelect(r.id)}
              >
                <td className="px-2 py-2 font-mono sam-text-helper">{r.id}</td>
                <td className="px-2 py-2 font-mono sam-text-helper">{orderNoById[r.orderId] ?? r.orderId}</td>
                <td className="px-2 py-2">{r.reporterName}</td>
                <td className="px-2 py-2 max-w-[140px] truncate">{storeNameByOrderId[r.orderId] ?? "—"}</td>
                <td className="px-2 py-2">{r.reportType}</td>
                <td className="px-2 py-2 whitespace-nowrap text-sam-muted">
                  {new Date(r.createdAt).toLocaleString("ko-KR")}
                </td>
                <td className="px-2 py-2">{STATUS_KO[r.status]}</td>
                <td className="px-2 py-2 max-w-[200px] truncate text-xs text-sam-muted">{r.adminResult ?? "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
