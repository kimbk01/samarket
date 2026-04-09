"use client";

import Link from "next/link";
import type { OrderStatusLog } from "@/lib/admin/delivery-orders-mock/types";

export function DeliveryAuditLogTable({
  logs,
  orderNoById,
}: {
  logs: OrderStatusLog[];
  orderNoById: Record<string, string>;
}) {
  const sorted = [...logs].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  if (sorted.length === 0) {
    return <p className="py-6 text-center text-sm text-gray-500">로그가 없습니다.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-ui-rect border border-gray-200 bg-white">
      <table className="w-full min-w-[960px] border-collapse text-[12px]">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-medium text-gray-600">
            <th className="px-2 py-2">시각</th>
            <th className="px-2 py-2">주문</th>
            <th className="px-2 py-2">행위자</th>
            <th className="px-2 py-2">액션</th>
            <th className="px-2 py-2">주문상태</th>
            <th className="px-2 py-2">결제</th>
            <th className="px-2 py-2">정산</th>
            <th className="px-2 py-2">사유</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((l) => (
            <tr key={l.id} className="border-b border-gray-100 hover:bg-gray-50/60">
              <td className="px-2 py-2 whitespace-nowrap text-gray-600">
                {new Date(l.createdAt).toLocaleString("ko-KR")}
              </td>
              <td className="px-2 py-2">
                <Link
                  href={`/admin/delivery-orders/${encodeURIComponent(l.orderId)}`}
                  className="font-mono text-signature underline"
                >
                  {orderNoById[l.orderId] ?? l.orderId}
                </Link>
              </td>
              <td className="px-2 py-2">
                {l.actorType}
                <span className="text-gray-400"> · </span>
                {l.actorId}
              </td>
              <td className="px-2 py-2 font-medium">{l.action}</td>
              <td className="px-2 py-2 text-gray-700">
                {l.fromOrderStatus ?? "—"} → {l.toOrderStatus ?? "—"}
              </td>
              <td className="px-2 py-2 text-gray-600">
                {l.fromPaymentStatus ?? "—"} → {l.toPaymentStatus ?? "—"}
              </td>
              <td className="px-2 py-2 text-gray-600">
                {l.fromSettlementStatus ?? "—"} → {l.toSettlementStatus ?? "—"}
              </td>
              <td className="px-2 py-2 max-w-[240px] truncate text-gray-600">{l.reason ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
