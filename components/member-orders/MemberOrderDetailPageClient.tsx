"use client";

import Link from "next/link";
import { useMemo } from "react";
import { getDemoBuyerUserId, getMemberOrder } from "@/lib/member-orders/member-order-store";
import { useMemberOrdersVersion } from "@/lib/member-orders/use-member-orders-store";
import { MemberOrderDetail } from "./MemberOrderDetail";

const BASE = "/mypage/store-orders";

export function MemberOrderDetailPageClient({ orderId }: { orderId: string }) {
  const v = useMemberOrdersVersion();
  const buyerId = getDemoBuyerUserId();

  const order = useMemo(() => {
    void v;
    return getMemberOrder(buyerId, orderId);
  }, [buyerId, orderId, v]);

  if (!buyerId) {
    return (
      <div className="min-h-screen bg-gray-50 px-4 py-16 text-center">
        <p className="text-sm text-gray-600">
          회원 역할로 전환한 뒤 다시 열어 주세요.
        </p>
        <Link href={BASE} className="mt-4 inline-block text-sm font-semibold text-violet-700 underline">
          목록으로
        </Link>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-gray-50 px-4 py-16 text-center">
        <p className="text-sm text-gray-600">주문을 찾을 수 없어요.</p>
        <Link href={BASE} className="mt-4 inline-block text-sm font-semibold text-violet-700 underline">
          목록으로
        </Link>
      </div>
    );
  }

  return (
    <MemberOrderDetail buyerUserId={buyerId} order={order} listHref={BASE} />
  );
}
