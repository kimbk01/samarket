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
  pending: "bg-gray-100 text-gray-700",
  active: "bg-signature/10 text-signature",
  expired: "bg-gray-200 text-gray-600",
  cancelled: "bg-gray-200 text-gray-500",
};

export function PointPromotionOrderList({ orders }: PointPromotionOrderListProps) {
  if (orders.length === 0) {
    return (
      <div className="rounded-lg bg-white p-8 text-center text-[14px] text-gray-500">
        포인트로 신청한 노출 내역이 없습니다.
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {orders.map((o) => (
        <li
          key={o.id}
          className="rounded-lg border border-gray-200 bg-white p-4"
        >
          <p className="font-medium text-gray-900">{o.targetTitle}</p>
          <p className="mt-0.5 text-[13px] text-gray-600">
            {POINT_PROMOTION_PLACEMENT_LABELS[o.placement]} · {o.durationDays}일
          </p>
          <p className="mt-0.5 text-[13px] text-gray-500">
            {o.pointCost.toLocaleString()}P 사용
          </p>
          <span
            className={`mt-2 inline-block rounded px-2 py-0.5 text-[12px] font-medium ${STATUS_CLASS[o.orderStatus]}`}
          >
            {POINT_PROMOTION_ORDER_STATUS_LABELS[o.orderStatus]}
          </span>
          <p className="mt-1 text-[12px] text-gray-400">
            {new Date(o.createdAt).toLocaleDateString("ko-KR")}
          </p>
        </li>
      ))}
    </ul>
  );
}
