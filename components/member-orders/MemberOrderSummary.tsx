"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MemberOrder } from "@/lib/member-orders/types";
import { formatMoneyPhp } from "@/lib/utils/format";

export function MemberOrderSummary({ order }: { order: MemberOrder }) {
  const { t } = useI18n();
  return (
    <dl className="space-y-2 text-sm">
      <div className="flex justify-between">
        <dt className="text-gray-500">{t("member_order_product_amount")}</dt>
        <dd>{formatMoneyPhp(order.product_amount)}</dd>
      </div>
      <div className="flex justify-between">
        <dt className="text-gray-500">{t("member_order_option_amount")}</dt>
        <dd>{formatMoneyPhp(order.option_amount)}</dd>
      </div>
      <div className="flex justify-between">
        <dt className="text-gray-500">
          {order.order_type === "delivery" ? t("member_order_delivery_fee") : t("member_order_pickup_misc_fee")}
        </dt>
        <dd>{formatMoneyPhp(order.delivery_fee)}</dd>
      </div>
      <div className="flex justify-between border-t border-gray-100 pt-2 text-base font-bold text-gray-900">
        <dt>{t("member_order_total_paid_amount")}</dt>
        <dd>{formatMoneyPhp(order.total_amount)}</dd>
      </div>
    </dl>
  );
}
