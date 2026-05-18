"use client";

import Link from "next/link";
import type { AdminDeliveryOrder } from "@/lib/admin/delivery-orders-admin/types";
import { SettlementStatusBadge } from "./DeliveryOrderBadges";
import { formatMoneyPhp } from "@/lib/utils/format";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

export function SettlementTable({ rows }: { rows: AdminDeliveryOrder[] }) {
  const { t } = useI18n();

  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-sam-muted">{t("admin_do_settlements_empty")}</p>;
  }
  return (
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table className="w-full min-w-[1000px] border-collapse sam-text-body-secondary">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app text-left text-xs font-medium text-sam-muted">
            <th className="px-2 py-2">{t("admin_do_th_order_no")}</th>
            <th className="px-2 py-2">{t("admin_do_th_store")}</th>
            <th className="px-2 py-2">{t("admin_do_th_order_amount")}</th>
            <th className="px-2 py-2">{t("admin_do_th_fee")}</th>
            <th className="px-2 py-2">{t("admin_do_th_settlement_amount")}</th>
            <th className="px-2 py-2">{t("admin_do_th_settlement_date")}</th>
            <th className="px-2 py-2">{t("admin_do_th_settlement_status")}</th>
            <th className="px-2 py-2">{t("admin_do_th_hold")}</th>
            <th className="px-2 py-2">{t("admin_do_th_hold_reason")}</th>
            <th className="px-2 py-2">{t("admin_do_common_action")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((o) => {
            const st = o.settlement;
            return (
              <tr key={o.id} className="border-b border-sam-border-soft hover:bg-sam-app/80">
                <td className="px-2 py-2 font-mono sam-text-helper">{o.orderNo}</td>
                <td className="px-2 py-2 max-w-[160px] truncate">{o.storeName}</td>
                <td className="px-2 py-2">{formatMoneyPhp(o.finalAmount)}</td>
                <td className="px-2 py-2">{st ? formatMoneyPhp(st.feeAmount) : "—"}</td>
                <td className="px-2 py-2 font-medium">{st ? formatMoneyPhp(st.settlementAmount) : "—"}</td>
                <td className="px-2 py-2 text-sam-muted">{st?.scheduledDate ?? "—"}</td>
                <td className="px-2 py-2">
                  <SettlementStatusBadge status={o.settlementStatus} />
                </td>
                <td className="px-2 py-2 text-center">{o.settlementStatus === "held" ? "Y" : "—"}</td>
                <td className="px-2 py-2 max-w-[200px] truncate text-xs text-sam-muted">
                  {st?.holdReason ?? "—"}
                </td>
                <td className="px-2 py-2">
                  <Link
                    href={`/admin/stores/orders/${encodeURIComponent(o.id)}`}
                    className="font-medium text-signature underline"
                  >
                    {t("admin_do_common_order")}
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
