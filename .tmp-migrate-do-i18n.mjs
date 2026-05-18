import fs from "node:fs";
import path from "node:path";

const dir = path.join(process.cwd(), "components/admin/delivery-orders");
const el = "motion.div".replace("motion.", "");

function w(name, content) {
  fs.writeFileSync(path.join(dir, name), content, "utf8");
  console.log("wrote", name);
}

w(
  "RefundRequestTable.tsx",
  `"use client";

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
    <${el} className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
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
                <${el} className="flex flex-wrap gap-1">
                  <Link
                    href={\`/admin/stores/orders/\${encodeURIComponent(o.id)}\`}
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
                </${el}>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </${el}>
  );
}
`
);

w(
  "OrderReportTable.tsx",
  `"use client";

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
    <${el} className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
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
                className={\`cursor-pointer border-b border-sam-border-soft \${active ? "bg-amber-50/80" : "hover:bg-sam-app/80"}\`}
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
    </${el}>
  );
}
`
);

w(
  "AdminDeliveryOrderChatDbClient.tsx",
  `"use client";

import Link from "next/link";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

type Props = { orderId: string };

export function AdminDeliveryOrderChatDbClient({ orderId }: Props) {
  const { t } = useI18n();

  return (
    <${el} className="space-y-4 p-4 md:p-6">
      <AdminPageHeader
        titleKey="admin_do_chat_title"
        descriptionKey="admin_do_chat_desc"
        backHref="/admin/order-chats"
      />
      <${el} className="flex flex-wrap gap-2 sam-text-body-secondary">
        <Link href={\`/admin/store-orders?order_id=\${encodeURIComponent(orderId)}\`} className="text-signature underline">
          {t("admin_do_chat_open_store_orders")}
        </Link>
        <span className="text-sam-muted">·</span>
        <Link href={\`/admin/stores/orders/\${encodeURIComponent(orderId)}\`} className="text-sam-muted underline">
          {t("admin_do_chat_delivery_table")}
        </Link>
      </${el}>
      <${el} className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 text-sm text-sam-muted">
        {t("admin_do_chat_room_hint", { orderId })}
      </${el}>
    </${el}>
  );
}
`
);

console.log("batch 1 done");
