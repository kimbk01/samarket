"use client";

import Link from "next/link";
import type { AdminDeliveryOrder } from "@/lib/admin/delivery-orders-admin/types";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { doAdminLocale } from "./do-admin-locale";

export function RefundRequestTable({
  rows,
  onApprove,
  onReject,
  busyOrderId = null,
}: {
  rows: AdminDeliveryOrder[];
  onApprove: (orderId: string) => void;
  onReject: (orderId: string) => void;
  busyOrderId?: string | null;
}) {
  const { t, language } = useI18n();
  const locale = doAdminLocale(language);

  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-sam-muted">{t("admin_do_refund_req_empty")}</p>;
  }
  return (
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table className="w-full min-w-[960px] border-collapse sam-text-body-secondary">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app text-left text-xs font-medium text-sam-muted">
            <th className="px-2 py-2">{t("admin_do_th_order_no")}</th>
            <th className="px-2 py-2">{t("admin_do_th_requester")}</th>
            <th className="px-2 py-2">{t("admin_do_th_store")}</th>
            <th className="px-2 py-2">{t("admin_do_th_type")}</th>
            <th className="px-2 py-2">{t("admin_do_th_request_date")}</th>
            <th className="px-2 py-2">{t("admin_do_th_reason")}</th>
            <th className="px-2 py-2">{t("admin_do_common_action")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((o) => (
            <tr key={o.id} className="border-b border-sam-border-soft">
              <td className="px-2 py-2 font-mono sam-text-helper">{o.orderNo}</td>
              <td className="px-2 py-2">{o.refundRequest?.requestedBy ?? "—"}</td>
              <td className="px-2 py-2 max-w-[160px] truncate">{o.storeName}</td>
              <td className="px-2 py-2 text-xs">{o.refundRequest?.category ?? "—"}</td>
              <td className="px-2 py-2 whitespace-nowrap text-sam-muted">
                {o.refundRequest ? new Date(o.refundRequest.requestedAt).toLocaleString(locale) : "—"}
              </td>
              <td className="px-2 py-2 max-w-[260px]">{o.refundRequest?.reason ?? "—"}</td>
              <td className="px-2 py-2">
                <div className="flex flex-wrap gap-1">
                  <Link
                    href={`/admin/stores/orders/${encodeURIComponent(o.id)}`}
                    className="text-xs font-medium text-signature underline"
                  >
                    {t("admin_do_common_detail")}
                  </Link>
                  <button
                    type="button"
                    disabled={busyOrderId !== null}
                    className="text-xs text-emerald-700 underline disabled:opacity-40"
                    onClick={() => onApprove(o.id)}
                  >
                    {busyOrderId === o.id ? "…" : t("admin_do_common_approve")}
                  </button>
                  <button
                    type="button"
                    disabled={busyOrderId !== null}
                    className="text-xs text-red-700 underline disabled:opacity-40"
                    onClick={() => onReject(o.id)}
                  >
                    {t("admin_do_common_reject")}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
