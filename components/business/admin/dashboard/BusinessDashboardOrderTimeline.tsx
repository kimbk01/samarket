"use client";

import Link from "next/link";
import { buildStoreOrdersHref } from "@/lib/business/store-orders-tab";
import { BUYER_ORDER_STATUS_LABEL } from "@/lib/stores/store-order-process-criteria";
import { formatBuyerPaymentDisplay } from "@/lib/stores/payment-methods-config";

export type TimelineOrder = {
  id: string;
  order_no: string;
  buyer_user_id: string;
  payment_amount: number;
  payment_status: string;
  order_status: string;
  created_at: string;
  buyer_payment_method?: string | null;
  buyer_payment_method_detail?: string | null;
};

export function BusinessDashboardOrderTimeline({
  storeId,
  orders,
}: {
  storeId: string;
  orders: TimelineOrder[];
}) {
  if (orders.length === 0) {
    return (
      <div className="rounded-ui-rect border border-dashed border-sam-border-soft bg-sam-app/40 px-4 py-14 text-center sam-text-body text-sam-muted">
        아직 주문이 없습니다.
      </div>
    );
  }

  return (
    <ul className="overflow-hidden rounded-ui-rect border border-sam-border bg-sam-surface divide-y divide-sam-border-soft">
      {orders.map((o) => (
        <li key={o.id} className="px-3 py-3 sm:px-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-mono sam-text-body font-semibold text-sam-fg">{o.order_no}</span>
                <span className="rounded-ui-rect bg-sam-surface-muted px-2 py-0.5 sam-text-xxs font-semibold text-sam-fg">
                  {BUYER_ORDER_STATUS_LABEL[o.order_status] ?? o.order_status}
                </span>
              </div>
              <p className="mt-1 sam-text-helper text-sam-muted">
                결제 {o.payment_status}
                {" · "}
                {formatBuyerPaymentDisplay(o.buyer_payment_method, o.buyer_payment_method_detail)}
              </p>
              <p className="mt-0.5 sam-text-xxs tabular-nums text-sam-meta">
                {new Date(o.created_at).toLocaleString("ko-KR")}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
              <span className="tabular-nums sam-text-body-lg font-bold text-sam-fg">
                ₱{Math.round(Number(o.payment_amount) || 0).toLocaleString()}
              </span>
              <Link
                href={buildStoreOrdersHref({ storeId, orderId: o.id })}
                className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-body-secondary font-semibold text-sam-fg transition hover:border-signature/40 hover:bg-sam-app"
              >
                상세
              </Link>
              <Link
                href={`/stores/owner/order-chat/${encodeURIComponent(o.id)}`}
                className="rounded-ui-rect bg-signature px-3 py-2 sam-text-body-secondary font-semibold text-white shadow-sm transition hover:opacity-95"
              >
                채팅
              </Link>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
