"use client";

import type { OrderReport } from "@/lib/admin/delivery-orders-mock/types";

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
    return <p className="py-6 text-center text-sm text-gray-500">접수된 신고가 없습니다.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-ui-rect border border-gray-200 bg-white">
      <table className="w-full min-w-[920px] border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-medium text-gray-600">
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
                className={`cursor-pointer border-b border-gray-100 ${active ? "bg-amber-50/80" : "hover:bg-gray-50/80"}`}
                onClick={() => onSelect(r.id)}
              >
                <td className="px-2 py-2 font-mono text-[12px]">{r.id}</td>
                <td className="px-2 py-2 font-mono text-[12px]">{orderNoById[r.orderId] ?? r.orderId}</td>
                <td className="px-2 py-2">{r.reporterName}</td>
                <td className="px-2 py-2 max-w-[140px] truncate">{storeNameByOrderId[r.orderId] ?? "—"}</td>
                <td className="px-2 py-2">{r.reportType}</td>
                <td className="px-2 py-2 whitespace-nowrap text-gray-600">
                  {new Date(r.createdAt).toLocaleString("ko-KR")}
                </td>
                <td className="px-2 py-2">{STATUS_KO[r.status]}</td>
                <td className="px-2 py-2 max-w-[200px] truncate text-xs text-gray-600">{r.adminResult ?? "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
