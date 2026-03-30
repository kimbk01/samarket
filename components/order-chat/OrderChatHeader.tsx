"use client";

import type { SharedOrderStatus } from "@/lib/shared-orders/types";

const STATUS_KO: Record<SharedOrderStatus, string> = {
  pending: "접수",
  accepted: "주문확인",
  preparing: "상품준비",
  delivering: "배송중",
  ready_for_pickup: "픽업준비",
  arrived: "배송지도착",
  completed: "주문완료",
  cancel_requested: "취소 요청",
  cancelled: "취소",
  refund_requested: "환불 요청",
  refunded: "환불 완료",
};

export function OrderChatHeader({
  orderNo,
  subtitle,
  orderStatus,
  sticky = true,
}: {
  orderNo: string;
  subtitle: string;
  orderStatus: SharedOrderStatus;
  /** 상단 탭·진행줄과 함께 한 덩어리로 고정할 때 false */
  sticky?: boolean;
}) {
  return (
    <header
      className={`${sticky ? "sticky top-0 z-10 " : ""}border-b border-gray-200 bg-white px-3 py-3 shadow-sm`}
    >
      <p className="text-center font-mono text-xs text-gray-400">{orderNo}</p>
      <p className="mt-0.5 text-center text-sm font-bold text-gray-900">{subtitle}</p>
      <p className="mt-1 text-center text-xs text-signature">현재 주문 상태 · {STATUS_KO[orderStatus]}</p>
    </header>
  );
}
