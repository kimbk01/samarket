"use client";

import type { MemberOrder } from "@/lib/member-orders/types";
import { formatMoneyPhp } from "@/lib/utils/format";

export function MemberOrderSummary({ order }: { order: MemberOrder }) {
  return (
    <dl className="space-y-2 text-sm">
      <div className="flex justify-between">
        <dt className="text-gray-500">상품금액</dt>
        <dd>{formatMoneyPhp(order.product_amount)}</dd>
      </div>
      <div className="flex justify-between">
        <dt className="text-gray-500">옵션금액</dt>
        <dd>{formatMoneyPhp(order.option_amount)}</dd>
      </div>
      <div className="flex justify-between">
        <dt className="text-gray-500">{order.order_type === "delivery" ? "배달비" : "포장·기타"}</dt>
        <dd>{formatMoneyPhp(order.delivery_fee)}</dd>
      </div>
      <div className="flex justify-between border-t border-gray-100 pt-2 text-base font-bold text-gray-900">
        <dt>총 결제금액</dt>
        <dd>{formatMoneyPhp(order.total_amount)}</dd>
      </div>
    </dl>
  );
}
