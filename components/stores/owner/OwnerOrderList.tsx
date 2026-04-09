"use client";

import type { OwnerOrder } from "@/lib/store-owner/types";
import { OwnerOrderCard } from "./OwnerOrderCard";

export function OwnerOrderList({
  storeId,
  slug,
  orders,
  onActionDone,
}: {
  storeId: string;
  slug: string;
  orders: OwnerOrder[];
  onActionDone?: () => void | Promise<void>;
}) {
  if (orders.length === 0) {
    return (
      <div className="rounded-ui-rect border border-dashed border-gray-200 bg-gray-50/80 py-16 text-center text-sm text-gray-500">
        이 탭에 표시할 주문이 없습니다.
      </div>
    );
  }
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {orders.map((o) => (
        <OwnerOrderCard
          key={o.id}
          storeId={storeId}
          slug={slug}
          order={o}
          onActionDone={onActionDone}
        />
      ))}
    </div>
  );
}
