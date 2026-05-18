"use client";

import type { AdminDeliveryOrder } from "@/lib/admin/delivery-orders-admin/types";
import { formatMoneyPhp } from "@/lib/utils/format";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

export function OrderAmountCard({ order }: { order: AdminDeliveryOrder }) {
  const { t } = useI18n();

  return (
    <dl className="grid gap-1 text-sm sm:grid-cols-2">
      <div className="flex justify-between sm:block">
        <dt className="text-sam-muted">{t("admin_do_amount_goods")}</dt>
        <dd>{formatMoneyPhp(order.productAmount)}</dd>
      </div>
      <div className="flex justify-between sm:block">
        <dt className="text-sam-muted">{t("admin_do_amount_options")}</dt>
        <dd>{formatMoneyPhp(order.optionAmount)}</dd>
      </div>
      <div className="flex justify-between sm:block">
        <dt className="text-sam-muted">{t("admin_do_amount_delivery")}</dt>
        <dd>{formatMoneyPhp(order.deliveryFee)}</dd>
      </div>
      <div className="flex justify-between sm:block">
        <dt className="text-sam-muted">{t("admin_do_amount_discount")}</dt>
        <dd>{formatMoneyPhp(order.discountAmount)}</dd>
      </div>
      <div className="flex justify-between border-t border-sam-border-soft pt-2 text-base font-bold sm:col-span-2">
        <dt>{t("admin_do_amount_final")}</dt>
        <dd>{formatMoneyPhp(order.finalAmount)}</dd>
      </div>
    </dl>
  );
}
