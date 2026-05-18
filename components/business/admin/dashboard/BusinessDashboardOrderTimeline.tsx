"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { buildStoreOrdersHref } from "@/lib/business/store-orders-tab";
import { buyerOrderStatusLabel } from "@/lib/stores/buyer-order-status-labels";
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
  const { t, language } = useI18n();
  const dateLocale = language === "ko" ? "ko-KR" : language === "zh" ? "zh-CN" : "en-US";

  if (orders.length === 0) {
    return (
      <div className="rounded-ui-rect border border-dashed border-sam-border-soft bg-sam-app/40 px-4 py-14 text-center sam-text-body text-sam-muted">
        {t("business_phase7_184")}
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
                  {buyerOrderStatusLabel(o.order_status, language)}
                </span>
              </div>
              <p className="mt-1 sam-text-helper text-sam-muted">
                {t("store_biz_payment_line", {
                  payment: formatBuyerPaymentDisplay(
                    o.buyer_payment_method,
                    o.buyer_payment_method_detail,
                    language
                  ),
                })}
              </p>
              <p className="mt-0.5 sam-text-xxs tabular-nums text-sam-meta">
                {new Date(o.created_at).toLocaleString(dateLocale)}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
              <span className="tabular-nums sam-text-body-lg font-bold text-sam-fg">
                ₱{Math.round(Number(o.payment_amount) || 0).toLocaleString()}
              </span>
              <Link
                href={buildStoreOrdersHref({ storeId, orderId: o.id })}
                className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-1.5 sam-text-helper font-semibold text-sam-fg hover:bg-sam-app"
              >
                {t("store_owner_view_detail")}
              </Link>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
