"use client";

import type { PointPromotionOrder } from "@/lib/types/point";
import {
  POINT_PROMOTION_ORDER_STATUS_LABELS,
  POINT_PROMOTION_PLACEMENT_LABELS,
} from "@/lib/points/point-utils";

interface PointPromotionOrderListProps {
  orders: PointPromotionOrder[];
}

const STATUS_CLASS: Record<PointPromotionOrder["orderStatus"], string> = {
  pending: "bg-sam-surface-muted text-sam-fg",
  active: "bg-signature/10 text-signature",
  expired: "bg-sam-border-soft text-sam-muted",
  cancelled: "bg-sam-border-soft text-sam-muted",
};

export function PointPromotionOrderList({ orders }: PointPromotionOrderListProps) {
  if (orders.length === 0) {
    return (
      <div className="rounded-ui-rect bg-sam-surface p-8 text-center text-[14px] text-sam-muted">
        포인트로 신청한 노출 내역이 없습니다.
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {orders.map((o) => (
        <li
          key={o.id}
          className="rounded-ui-rect border border-sam-border bg-sam-surface p-4"
        >
          <p className="font-medium text-sam-fg">{o.targetTitle}</p>
          <p className="mt-0.5 text-[13px] text-sam-muted">
            {POINT_PROMOTION_PLACEMENT_LABELS[o.placement]} · {o.durationDays}일
          </p>
          <p className="mt-0.5 text-[13px] text-sam-muted">
            {o.pointCost.toLocaleString()}P 사용
          </p>
          <span
            className={`mt-2 inline-block rounded px-2 py-0.5 text-[12px] font-medium ${STATUS_CLASS[o.orderStatus]}`}
          >
            {POINT_PROMOTION_ORDER_STATUS_LABELS[o.orderStatus]}
          </span>
          <p className="mt-1 text-[12px] text-sam-meta">
            {new Date(o.createdAt).toLocaleDateString("ko-KR")}
          </p>
        </li>
      ))}
    </ul>
  );
}
