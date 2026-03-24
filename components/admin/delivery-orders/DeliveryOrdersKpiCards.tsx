"use client";

import { useMemo } from "react";
import type { AdminDeliveryOrder } from "@/lib/admin/delivery-orders-mock/types";
import { formatMoneyPhp } from "@/lib/utils/format";

function isToday(iso: string) {
  const d = new Date(iso);
  const t = new Date();
  return d.toDateString() === t.toDateString();
}

export function DeliveryOrdersKpiCards({ orders }: { orders: AdminDeliveryOrder[] }) {
  const data = useMemo(() => {
    const today = orders.filter((o) => isToday(o.createdAt));
    const completedToday = today.filter((o) => o.orderStatus === "completed");
    const cancelledToday = today.filter((o) => o.orderStatus === "cancelled");
    const refundReqToday = today.filter((o) => o.orderStatus === "refund_requested");
    const inProgress = orders.filter((o) =>
      ["pending", "accepted", "preparing", "ready_for_pickup", "delivering", "arrived"].includes(
        o.orderStatus
      )
    );
    const schedAmt = orders
      .filter((o) => o.settlementStatus === "scheduled")
      .reduce((s, o) => s + (o.settlement?.settlementAmount ?? 0), 0);
    const heldAmt = orders
      .filter((o) => o.settlementStatus === "held")
      .reduce((s, o) => s + (o.settlement?.settlementAmount ?? 0), 0);

    const byStore = new Map<string, number>();
    for (const o of orders) {
      const name = o.storeName?.trim() || "—";
      byStore.set(name, (byStore.get(name) ?? 0) + 1);
    }
    const top5 = [...byStore.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

    const paidSumToday = today
      .filter((o) => o.paymentStatus === "paid")
      .reduce((s, o) => s + (o.finalAmount ?? 0), 0);

    return {
      todayCount: today.length,
      completedToday: completedToday.length,
      cancelledToday: cancelledToday.length,
      refundReqToday: refundReqToday.length,
      inProgress: inProgress.length,
      schedAmt,
      heldAmt,
      top5,
      paidSumToday,
    };
  }, [orders]);

  const card = (label: string, value: string | number) => (
    <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-1 text-lg font-bold text-gray-900">{value}</p>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-4">
        {card("오늘 주문", data.todayCount)}
        {card("오늘 완료", data.completedToday)}
        {card("오늘 취소", data.cancelledToday)}
        {card("오늘 환불요청", data.refundReqToday)}
        {card("진행중 주문", data.inProgress)}
        {card("오늘 결제합(유료)", formatMoneyPhp(data.paidSumToday))}
        {card("정산 예정(합계)", formatMoneyPhp(data.schedAmt))}
        {card("정산 보류(합계)", formatMoneyPhp(data.heldAmt))}
      </div>
      <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
        <p className="text-xs font-semibold text-gray-700">매장별 주문 Top 5</p>
        <ol className="mt-2 space-y-1 text-sm">
          {data.top5.length === 0 ? (
            <li className="text-gray-500">표시할 주문이 없습니다.</li>
          ) : (
            data.top5.map(([name, n], i) => (
              <li key={name}>
                {i + 1}. {name} — {n}건
              </li>
            ))
          )}
        </ol>
      </div>
    </div>
  );
}
