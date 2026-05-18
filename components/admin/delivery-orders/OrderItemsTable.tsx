"use client";

import type { AdminDeliveryOrderItem } from "@/lib/admin/delivery-orders-admin/types";
import { formatMoneyPhp } from "@/lib/utils/format";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

export function OrderItemsTable({ items }: { items: AdminDeliveryOrderItem[] }) {
  const { t } = useI18n();

  return (
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app text-left text-xs font-medium text-sam-muted">
            <th className="px-3 py-2">{t("admin_do_th_menu")}</th>
            <th className="px-3 py-2">{t("admin_do_th_option")}</th>
            <th className="px-3 py-2">{t("admin_do_th_qty")}</th>
            <th className="px-3 py-2">{t("admin_do_th_unit_price")}</th>
            <th className="px-3 py-2">{t("admin_do_th_option_price")}</th>
            <th className="px-3 py-2">{t("admin_do_th_line_total")}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.id} className="border-b border-sam-border-soft">
              <td className="px-3 py-2 font-medium">{it.menuName}</td>
              <td className="px-3 py-2 text-xs text-sam-muted">
                {it.options.length
                  ? it.options.map((o) => `${o.optionGroupName}: ${o.optionName} (+${o.optionPrice})`).join(" · ")
                  : "—"}
              </td>
              <td className="px-3 py-2">{it.qty}</td>
              <td className="px-3 py-2">{formatMoneyPhp(it.unitPrice)}</td>
              <td className="px-3 py-2">{formatMoneyPhp(it.optionExtra)}</td>
              <td className="px-3 py-2 font-semibold">{formatMoneyPhp(it.lineTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
