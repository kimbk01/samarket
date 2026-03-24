"use client";

import type { AdminDeliveryOrder } from "@/lib/admin/delivery-orders-mock/types";
import { formatKstDatetimeLong } from "@/lib/datetime/format-kst-datetime";

export function OrderDetailCard({ order }: { order: AdminDeliveryOrder }) {
  return (
    <dl className="grid gap-2 text-sm sm:grid-cols-2">
      <div>
        <dt className="text-gray-500">주문번호</dt>
        <dd className="font-mono font-medium">{order.orderNo}</dd>
      </div>
      <div>
        <dt className="text-gray-500">주문일시</dt>
        <dd>{formatKstDatetimeLong(order.createdAt)}</dd>
      </div>
      <div>
        <dt className="text-gray-500">주문자</dt>
        <dd>
          {order.buyerName}{" "}
          <span className="text-xs text-gray-500">({order.buyerUserId})</span>
        </dd>
      </div>
      <div>
        <dt className="text-gray-500">연락처</dt>
        <dd>{order.buyerPhone}</dd>
      </div>
      <div>
        <dt className="text-gray-500">매장</dt>
        <dd>{order.storeName}</dd>
      </div>
      <div>
        <dt className="text-gray-500">매장 오너</dt>
        <dd>
          {order.storeOwnerName}{" "}
          <span className="text-xs text-gray-500">({order.storeOwnerUserId})</span>
        </dd>
      </div>
      <div>
        <dt className="text-gray-500">주문 방식</dt>
        <dd>{order.orderType === "delivery" ? "배달" : "포장"}</dd>
      </div>
      {order.orderType === "delivery" ? (
        <div className="sm:col-span-2">
          <dt className="text-gray-500">배달 주소</dt>
          <dd>{order.addressSummary}</dd>
        </div>
      ) : (
        <div>
          <dt className="text-gray-500">포장</dt>
          <dd>{order.pickupNote ?? "—"}</dd>
        </div>
      )}
      <div>
        <dt className="text-gray-500">고객 선택 결제</dt>
        <dd>{order.buyerCheckoutPaymentMethod?.trim() || "—"}</dd>
      </div>
      <div className="sm:col-span-2">
        <dt className="text-gray-500">요청사항</dt>
        <dd>{order.requestNote?.trim() || "—"}</dd>
      </div>
    </dl>
  );
}
