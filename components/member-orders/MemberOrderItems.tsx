"use client";

import type { MemberOrderItem } from "@/lib/member-orders/types";
import { formatMoneyPhp } from "@/lib/utils/format";

export function MemberOrderItems({ items }: { items: MemberOrderItem[] }) {
  return (
    <ul className="divide-y divide-gray-100 rounded-ui-rect border border-gray-100 bg-white">
      {items.map((it) => (
        <li key={it.id} className="flex gap-3 px-3 py-3 text-sm">
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-gray-900">{it.menu_name}</p>
            <p className="text-xs text-gray-500">{it.options_summary}</p>
            <p className="mt-0.5 text-xs text-gray-400">수량 {it.qty}</p>
          </div>
          <p className="shrink-0 font-medium text-gray-900">{formatMoneyPhp(it.line_total)}</p>
        </li>
      ))}
    </ul>
  );
}
