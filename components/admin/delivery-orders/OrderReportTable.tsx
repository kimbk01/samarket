"use client";

import type { OrderReport } from "@/lib/admin/delivery-orders-admin/types";
import type { MessageKey } from "@/lib/i18n/messages";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { doAdminLocale } from "./do-admin-locale";

const STATUS_KEYS: Record<OrderReport["status"], MessageKey> = {
  open: "admin_do_report_status_open",
  reviewing: "admin_do_report_status_reviewing",
  resolved: "admin_do_report_status_resolved",
  rejected: "admin_do_report_status_rejected",
};

export function OrderReportTable({
  rows,
  orderNoById,
  storeNameByOrderId,
  selectedId,
  onSelect,
}: {
  rows: OrderReport[];
  orderNoById: Record<string, string>;
  storeNameByOrderId: Record<string, string>;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const { t, language } = useI18n();
  const locale = doAdminLocale(language);

  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-sam-muted">{t("admin_do_reports_empty_table")}</p>;
  }
  return (
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table className="w-full min-w-[920px] border-collapse sam-text-body-secondary">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app text-left text-xs font-medium text-sam-muted">
            <th className="px-2 py-2">{t("admin_do_th_report_id")}</th>
            <th className="px-2 py-2">{t("admin_do_th_order_no")}</th>
            <th className="px-2 py-2">{t("admin_do_th_reporter")}</th>
            <th className="px-2 py-2">{t("admin_do_th_store")}</th>
            <th className="px-2 py-2">{t("admin_do_th_type")}</th>
            <th className="px-2 py-2">{t("admin_do_th_received")}</th>
            <th className="px-2 py-2">{t("admin_do_th_status")}</th>
            <th className="px-2 py-2">{t("admin_do_th_measure")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const active = selectedId === r.id;
            return (
              <tr
                key={r.id}
                className={`cursor-pointer border-b border-sam-border-soft ${active ? "bg-amber-50/80" : "hover:bg-sam-app/80"}`}
                onClick={() => onSelect(r.id)}
              >
                <td className="px-2 py-2 font-mono sam-text-helper">{r.id}</td>
                <td className="px-2 py-2 font-mono sam-text-helper">{orderNoById[r.orderId] ?? r.orderId}</td>
                <td className="px-2 py-2">{r.reporterName}</td>
                <td className="px-2 py-2 max-w-[140px] truncate">{storeNameByOrderId[r.orderId] ?? "—"}</td>
                <td className="px-2 py-2">{r.reportType}</td>
                <td className="px-2 py-2 whitespace-nowrap text-sam-muted">
                  {new Date(r.createdAt).toLocaleString(locale)}
                </td>
                <td className="px-2 py-2">{t(STATUS_KEYS[r.status])}</td>
                <td className="px-2 py-2 max-w-[200px] truncate text-xs text-sam-muted">{r.adminResult ?? "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
