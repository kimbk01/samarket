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
      <section className="space-y-2">
        <h2 className="sam-text-body font-semibold text-sam-fg">최근 주문</h2>
        <p className="rounded-ui-rect border border-dashed border-sam-border bg-sam-surface px-4 py-8 text-center sam-text-body text-sam-muted">
          아직 주문이 없습니다.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between px-0.5">
        <h2 className="sam-text-body font-semibold text-sam-fg">최근 주문</h2>
        <Link
          href={buildStoreOrdersHref({ storeId })}
          className="sam-text-body-secondary font-medium text-signature"
        >
          전체 보기
        </Link>
      </div>
      <ul className="space-y-2">
        {orders.map((o) => (
          <li
            key={o.id}
            className="rounded-ui-rect border border-sam-border bg-sam-surface p-3 shadow-sm sm:flex sm:items-center sm:justify-between sm:gap-3"
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono sam-text-body-secondary font-semibold text-sam-fg">{o.order_no}</span>
                <span className="rounded bg-sam-surface-muted px-1.5 py-0.5 sam-text-xxs font-medium text-sam-fg">
                  {BUYER_ORDER_STATUS_LABEL[o.order_status] ?? o.order_status}
                </span>
              </div>
              <p className="mt-1 sam-text-helper text-sam-muted">
                고객 {o.buyer_user_id.slice(0, 8)}… · 결제 {o.payment_status} ·{" "}
                {formatBuyerPaymentDisplay(o.buyer_payment_method, o.buyer_payment_method_detail)}
              </p>
              <p className="sam-text-xxs text-sam-meta">{new Date(o.created_at).toLocaleString("ko-KR")}</p>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 sm:mt-0 sm:shrink-0">
              <span className="sam-text-body font-bold text-sam-fg">
                ₱{Math.round(Number(o.payment_amount) || 0).toLocaleString()}
              </span>
              <Link
                href={buildStoreOrdersHref({
                  storeId,
                  orderId: o.id,
                })}
                className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-1.5 sam-text-helper font-medium text-sam-fg"
              >
                상세
              </Link>
              <Link
                href={`/my/business/store-order-chat/${encodeURIComponent(o.id)}`}
                className="rounded-ui-rect bg-signature px-3 py-1.5 sam-text-helper font-medium text-white"
              >
                채팅
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
