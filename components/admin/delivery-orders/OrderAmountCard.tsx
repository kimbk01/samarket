"use client";

import type { AdminDeliveryOrder } from "@/lib/admin/delivery-orders-mock/types";
import { formatMoneyPhp } from "@/lib/utils/format";

export function OrderAmountCard({ order }: { order: AdminDeliveryOrder }) {
  return (
    <dl className="grid gap-1 text-sm sm:grid-cols-2">
      <div className="flex justify-between sm:block">
        <dt className="text-gray-500">상품금액</dt>
        <dd>{formatMoneyPhp(order.productAmount)}</dd>
      </div>
      <div className="flex justify-between sm:block">
        <dt className="text-gray-500">옵션금액</dt>
        <dd>{formatMoneyPhp(order.optionAmount)}</dd>
      </div>
      <div className="flex justify-between sm:block">
        <dt className="text-gray-500">배달비</dt>
        <dd>{formatMoneyPhp(order.deliveryFee)}</dd>
      </div>
      <div className="flex justify-between sm:block">
        <dt className="text-gray-500">할인</dt>
        <dd>{formatMoneyPhp(order.discountAmount)}</dd>
      </div>
      <div className="flex justify-between border-t border-gray-100 pt-2 text-base font-bold sm:col-span-2">
        <dt>최종 결제금액</dt>
        <dd>{formatMoneyPhp(order.finalAmount)}</dd>
      </div>
    </dl>
  );
}
