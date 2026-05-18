"use client";

import Link from "next/link";
import type { AdminDeliveryOrder } from "@/lib/admin/delivery-orders-admin/types";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { doAdminLocale } from "./do-admin-locale";

export function CancelRequestTable({
  rows,
  onApprove,
  onReject,
  showWorkflowActions = true,
}: {
  rows: AdminDeliveryOrder[];
  onApprove: (orderId: string) => void;
  onReject: (orderId: string) => void;
  showWorkflowActions?: boolean;
}) {
  const { t, language } = useI18n();
  const locale = doAdminLocale(language);

  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-sam-muted">{t("admin_do_cancel_req_empty")}</p>;
  }
  return (
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table className="w-full min-w-[900px] border-collapse sam-text-body-secondary">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app text-left text-xs font-medium text-sam-muted">
            <th className="px-2 py-2">{t("admin_do_th_order_no")}</th>
            <th className="px-2 py-2">{t("admin_do_th_buyer")}</th>
            <th className="px-2 py-2">{t("admin_do_th_store")}</th>
            <th className="px-2 py-2">{t("admin_do_th_request_date")}</th>
            <th className="px-2 py-2">{t("admin_do_th_reason")}</th>
            <th className="px-2 py-2">{t("admin_do_common_action")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((o) => (
            <tr key={o.id} className="border-b border-sam-border-soft">
              <td className="px-2 py-2 font-mono sam-text-helper">{o.orderNo}</td>
              <td className="px-2 py-2">{o.buyerName}</td>
              <td className="px-2 py-2 max-w-[160px] truncate">{o.storeName}</td>
              <td className="px-2 py-2 whitespace-nowrap text-sam-muted">
                {o.cancelRequest ? new Date(o.cancelRequest.requestedAt).toLocaleString(locale) : "—"}
              </td>
              <td className="px-2 py-2 max-w-[280px] text-sam-fg">{o.cancelRequest?.reason ?? "—"}</td>
              <td className="px-2 py-2">
                <div className="flex flex-wrap gap-1">
                  <Link
                    href={`/admin/stores/orders/${encodeURIComponent(o.id)}`}
                    className="text-xs font-medium text-signature underline"
                  >
                    {t("admin_do_common_detail")}
                  </Link>
                  {showWorkflowActions ? (
                    <>
                      <button
                        type="button"
                        className="text-xs text-emerald-700 underline"
                        onClick={() => onApprove(o.id)}
                      >
                        {t("admin_do_common_approve")}
                      </button>
                      <button
                        type="button"
                        className="text-xs text-red-700 underline"
                        onClick={() => onReject(o.id)}
                      >
                        {t("admin_do_common_reject")}
                      </button>
                    </>
                  ) : (
                    <Link
                      href={`/admin/store-orders?order_id=${encodeURIComponent(o.id)}`}
                      className="text-xs text-sam-muted underline"
                    >
                      {t("admin_do_nav_store_orders")}
                    </Link>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
