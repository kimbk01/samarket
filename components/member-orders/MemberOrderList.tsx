"use client";

import type { MemberOrder } from "@/lib/member-orders/types";
import { MemberOrderCard } from "./MemberOrderCard";

export function MemberOrderList({
  orders,
  basePath,
  onOpenCancel,
}: {
  orders: MemberOrder[];
  basePath: string;
  onOpenCancel?: (order: MemberOrder) => void;
}) {
  if (orders.length === 0) {
    return (
      <div className="rounded-ui-rect border border-dashed border-sam-border bg-sam-app py-16 text-center text-sm text-sam-muted">
        주문 내역이 없어요.
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {orders.map((o) => (
        <MemberOrderCard
          key={o.id}
          order={o}
          detailHref={`${basePath}/${encodeURIComponent(o.id)}`}
          chatHref={`${basePath}/${encodeURIComponent(o.id)}/chat`}
          onOpenCancel={onOpenCancel}
        />
      ))}
    </div>
  );
}
