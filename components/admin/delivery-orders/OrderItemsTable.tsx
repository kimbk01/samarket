"use client";

import type { AdminDeliveryOrderItem } from "@/lib/admin/delivery-orders-mock/types";
import { formatMoneyPhp } from "@/lib/utils/format";

export function OrderItemsTable({ items }: { items: AdminDeliveryOrderItem[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-medium text-gray-600">
            <th className="px-3 py-2">메뉴</th>
            <th className="px-3 py-2">옵션</th>
            <th className="px-3 py-2">수량</th>
            <th className="px-3 py-2">단가</th>
            <th className="px-3 py-2">옵션가</th>
            <th className="px-3 py-2">합계</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.id} className="border-b border-gray-100">
              <td className="px-3 py-2 font-medium">{it.menuName}</td>
              <td className="px-3 py-2 text-xs text-gray-600">
                {it.options.length
                  ? it.options.map((o) => `${o.optionGroupName}: ${o.optionName} (+${o.optionPrice})`).join(" · ")
                  : "—"}
              </td>
              <td className="px-3 py-2">{it.qty}</td>
              <td className="px-3 py-2">{formatMoneyPhp(it.unitPrice)}</td>
              <td className="px-3 py-2">{formatMoneyPhp(it.optionExtra)}</td>
              <td className="px-3 py-2 font-semibold">{formatMoneyPhp(it.lineTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
