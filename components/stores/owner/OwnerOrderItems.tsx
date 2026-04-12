"use client";

import type { OwnerOrderItem } from "@/lib/store-owner/types";
import { formatMoneyPhp } from "@/lib/utils/format";

export function OwnerOrderItems({ items }: { items: OwnerOrderItem[] }) {
  return (
    <ul className="divide-y divide-sam-border-soft rounded-ui-rect border border-sam-border-soft bg-sam-surface">
      {items.map((it) => (
        <li key={it.id} className="flex gap-3 px-3 py-3 text-sm">
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-sam-fg">{it.menu_name}</p>
            <p className="text-xs text-sam-muted">{it.options_summary}</p>
            <p className="mt-0.5 text-xs text-sam-meta">수량 {it.qty}</p>
          </div>
          <p className="shrink-0 font-medium text-sam-fg">{formatMoneyPhp(it.line_total)}</p>
        </li>
      ))}
    </ul>
  );
}
