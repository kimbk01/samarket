"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { AdminDeliveryOrder } from "@/lib/admin/delivery-orders-admin/types";
import { formatMoneyPhp } from "@/lib/utils/format";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

function isToday(iso: string) {
  const d = new Date(iso);
  const t = new Date();
  return d.toDateString() === t.toDateString();
}

export function DeliveryOrdersKpiCards({ orders }: { orders: AdminDeliveryOrder[] }) {
  const { t } = useI18n();
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
      top5,
      paidSumToday,
    };
  }, [orders]);

  const card = (label: string, value: string | number) => (
    <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-3 shadow-sm">
      <p className="text-xs text-sam-muted">{label}</p>
      <p className="mt-1 text-lg font-bold text-sam-fg">{value}</p>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-3">
        {card(t("admin_do_kpi_today_orders"), data.todayCount)}
        {card(t("admin_do_kpi_today_completed"), data.completedToday)}
        {card(t("admin_do_kpi_today_cancelled"), data.cancelledToday)}
        {card(t("admin_do_kpi_today_refund_req"), data.refundReqToday)}
        {card(t("admin_do_kpi_in_progress"), data.inProgress)}
        {card(t("admin_do_kpi_paid_sum_today"), formatMoneyPhp(data.paidSumToday))}
      </div>
      <p className="sam-text-helper text-sam-muted">
        {t("admin_do_kpi_settlement_see_ledger")}{" "}
        <Link href="/admin/store-settlements" className="text-signature underline">
          /admin/store-settlements
        </Link>
      </p>
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-3 shadow-sm">
        <p className="text-xs font-semibold text-sam-fg">{t("admin_do_kpi_store_top5")}</p>
        <ol className="mt-2 space-y-1 text-sm">
          {data.top5.length === 0 ? (
            <li className="text-sam-muted">{t("admin_do_kpi_no_orders")}</li>
          ) : (
            data.top5.map(([name, n], i) => (
              <li key={name}>
                {t("admin_do_kpi_store_rank", { rank: i + 1, name, count: n })}
              </li>
            ))
          )}
        </ol>
      </div>
    </div>
  );
}
