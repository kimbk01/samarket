"use client";

import Link from "next/link";
import type { AdminDeliveryOrder } from "@/lib/admin/delivery-orders-mock/types";
import { SettlementStatusBadge } from "./DeliveryOrderBadges";
import { formatMoneyPhp } from "@/lib/utils/format";

export function SettlementTable({ rows }: { rows: AdminDeliveryOrder[] }) {
  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-gray-500">조건에 맞는 정산 행이 없습니다.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-ui-rect border border-gray-200 bg-white">
      <table className="w-full min-w-[1000px] border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-medium text-gray-600">
            <th className="px-2 py-2">주문번호</th>
            <th className="px-2 py-2">매장</th>
            <th className="px-2 py-2">주문금액</th>
            <th className="px-2 py-2">수수료</th>
            <th className="px-2 py-2">정산예정액</th>
            <th className="px-2 py-2">정산예정일</th>
            <th className="px-2 py-2">정산상태</th>
            <th className="px-2 py-2">보류</th>
            <th className="px-2 py-2">보류사유</th>
            <th className="px-2 py-2">액션</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((o) => {
            const st = o.settlement;
            return (
              <tr key={o.id} className="border-b border-gray-100 hover:bg-gray-50/80">
                <td className="px-2 py-2 font-mono text-[12px]">{o.orderNo}</td>
                <td className="px-2 py-2 max-w-[160px] truncate">{o.storeName}</td>
                <td className="px-2 py-2">{formatMoneyPhp(o.finalAmount)}</td>
                <td className="px-2 py-2">{st ? formatMoneyPhp(st.feeAmount) : "—"}</td>
                <td className="px-2 py-2 font-medium">{st ? formatMoneyPhp(st.settlementAmount) : "—"}</td>
                <td className="px-2 py-2 text-gray-600">{st?.scheduledDate ?? "—"}</td>
                <td className="px-2 py-2">
                  <SettlementStatusBadge status={o.settlementStatus} />
                </td>
                <td className="px-2 py-2 text-center">{o.settlementStatus === "held" ? "Y" : "—"}</td>
                <td className="px-2 py-2 max-w-[200px] truncate text-xs text-gray-600">
                  {st?.holdReason ?? "—"}
                </td>
                <td className="px-2 py-2">
                  <Link
                    href={`/admin/delivery-orders/${encodeURIComponent(o.id)}`}
                    className="font-medium text-signature underline"
                  >
                    주문
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
