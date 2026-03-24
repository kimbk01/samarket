"use client";

import { AppBackButton } from "@/components/navigation/AppBackButton";
import { PointBalanceCard } from "@/components/points/PointBalanceCard";
import { PointPromotionOrderList } from "@/components/points/PointPromotionOrderList";
import type { PointPromotionOrder } from "@/lib/types/point";

export default function MyPointsPromotionsPage() {
  const balance = 0;
  const orders: PointPromotionOrder[] = [];

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 flex items-center border-b border-gray-100 bg-white px-4 py-3">
        <AppBackButton backHref="/my/points" />
        <h1 className="flex-1 text-center text-[16px] font-semibold text-gray-900">
          포인트 노출 신청
        </h1>
        <span className="w-11 shrink-0" />
      </header>
      <div className="space-y-6 p-4">
        <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
          노출 신청·내 상품 연동은 별도 API 준비 후 제공됩니다. 데모용 목록·폼은 제거했습니다.
        </div>
        <PointBalanceCard balance={balance} />
        <div>
          <h2 className="mb-2 text-[15px] font-semibold text-gray-900">
            내 노출 신청 내역
          </h2>
          <PointPromotionOrderList orders={orders} />
        </div>
      </div>
    </div>
  );
}
