"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import type { AdminDeliveryOrder } from "@/lib/admin/delivery-orders-admin/types";
import {
  AdminActionStatusBadge,
  OrderStatusBadge,
  PaymentStatusBadge,
} from "./DeliveryOrderBadges";
import { formatStoreOrderDeliveryAddressPlain } from "@/lib/addresses/store-order-delivery-address-display";
import { formatMoneyPhp } from "@/lib/utils/format";
import { formatKstDatetimeLong } from "@/lib/datetime/format-kst-datetime";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

export type OrderTableSelection = {
  selectedIds: ReadonlySet<string>;
  onToggleRow: (orderId: string, checked: boolean) => void;
  onToggleAllVisible: (checked: boolean) => void;
};

function shortId(id: string, len = 8) {
  if (!id) return "—";
  return id.length <= len ? id : `${id.slice(0, len)}…`;
}

export function OrderTable({ rows, selection }: { rows: AdminDeliveryOrder[]; selection?: OrderTableSelection }) {
  const { t } = useI18n();

  const itemsLineSummary = (o: AdminDeliveryOrder): string => {
    if (!o.items?.length) return t("admin_do_no_items");
    return o.items.map((it) => `${it.menuName}×${it.qty}`).join(", ");
  };

  const fulfillmentSummary = (o: AdminDeliveryOrder): string => {
    if (o.orderType === "delivery") {
      const plain = formatStoreOrderDeliveryAddressPlain({
        summary: o.addressSummary,
        detail: o.addressDetail,
      });
      return plain || t("admin_do_no_address");
    }
    return o.pickupNote?.trim() ? t("admin_do_pickup_memo", { note: o.pickupNote }) : t("admin_do_pickup");
  };

  const slaBadgeLabel = (o: AdminDeliveryOrder): string | null => {
    const level = (o.slaWarningLevel ?? "").trim();
    const reason = (o.slaWarningReason ?? "").trim();
    if (!level && !reason && !o.needsAdminAttention) return null;
    if (reason === "pending_over_5m") return t("admin_do_sla_pending");
    if (reason === "eta_overdue") return t("admin_do_sla_eta");
    if (reason === "delivery_over_60m") return t("admin_do_sla_long_delivery");
    if (reason === "unassigned_over_10m") return t("admin_do_sla_unassigned");
    if (reason === "refund_overdue") return t("admin_do_sla_refund");
    if (o.needsAdminAttention) return t("admin_do_needs_attention");
    return level ? `SLA ${level}` : "SLA";
  };

  const visibleIds = rows.map((r) => r.id);
  const allVisibleSelected =
    selection != null &&
    visibleIds.length > 0 &&
    visibleIds.every((id) => selection.selectedIds.has(id));
  const someVisibleSelected =
    selection != null && visibleIds.some((id) => selection.selectedIds.has(id));
  const selectAllRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const elRef = selectAllRef.current;
    if (elRef) {
      elRef.indeterminate = Boolean(someVisibleSelected && !allVisibleSelected);
    }
  }, [someVisibleSelected, allVisibleSelected]);

  if (rows.length === 0) {
    return <p className="py-8 text-center text-sm text-sam-muted">{t("admin_do_orders_empty")}</p>;
  }

  return (
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table className="w-full min-w-[1240px] border-collapse sam-text-body-secondary">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app text-left text-xs font-medium text-sam-muted">
            {selection ? (
              <th className="w-10 px-2 py-2 text-center">
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={(e) => selection.onToggleAllVisible(e.target.checked)}
                  className="rounded border-sam-border"
                  title={t("admin_do_select_all_aria")}
                  aria-label={t("admin_do_select_all_aria")}
                />
              </th>
            ) : null}
            <th className="px-2 py-2">{t("admin_do_th_order_no")}</th>
            <th className="px-2 py-2">{t("admin_do_th_date")}</th>
            <th className="px-2 py-2 min-w-[160px]">{t("admin_do_th_buyer_contact")}</th>
            <th className="px-2 py-2 min-w-[160px]">{t("admin_do_th_store_ops")}</th>
            <th className="px-2 py-2 min-w-[220px]">{t("admin_do_th_delivery_request")}</th>
            <th className="px-2 py-2">{t("admin_do_th_method")}</th>
            <th className="px-2 py-2">{t("admin_do_th_amount")}</th>
            <th className="px-2 py-2">{t("admin_do_th_payment")}</th>
            <th className="px-2 py-2">{t("admin_do_th_order_status")}</th>
            <th className="px-2 py-2">{t("admin_do_th_measure")}</th>
            <th className="px-2 py-2">{t("admin_do_common_action")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((o) => {
            const src = o.orderSource ?? "store_db";
            const consoleHref = `/admin/stores/orders/${encodeURIComponent(o.id)}`;
            const actionHref = `/admin/store-orders?order_id=${encodeURIComponent(o.id)}`;
            const sla = slaBadgeLabel(o);
            return (
              <tr key={`${src}-${o.id}`} className="border-b border-sam-border-soft align-top hover:bg-sam-app/80">
                {selection ? (
                  <td className="px-2 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={selection.selectedIds.has(o.id)}
                      onChange={(e) => selection.onToggleRow(o.id, e.target.checked)}
                      className="rounded border-sam-border"
                      aria-label={t("admin_do_select_order_aria", { orderNo: o.orderNo })}
                    />
                  </td>
                ) : null}
                <td className="px-2 py-2 font-mono sam-text-helper whitespace-nowrap">{o.orderNo}</td>
                <td className="px-2 py-2 whitespace-nowrap text-sam-muted">
                  {formatKstDatetimeLong(o.createdAt)}
                  {sla ? (
                    <div className="mt-1">
                      <span className="inline-flex items-center rounded bg-rose-100 px-2 py-0.5 sam-text-xxs font-semibold text-rose-950">
                        {sla}
                      </span>
                    </div>
                  ) : null}
                </td>
                <td className="px-2 py-2 text-sam-fg">
                  <div className="font-medium">{o.buyerName || "—"}</div>
                  <div className="sam-text-helper text-sam-muted" title={o.buyerPhone}>
                    {o.buyerPhone?.trim() ? o.buyerPhone : t("admin_do_no_phone")}
                  </div>
                  <div className="font-mono sam-text-xxs text-sam-muted" title={o.buyerUserId}>
                    {t("admin_do_member_id", { id: shortId(o.buyerUserId, 12) })}
                  </div>
                </td>
                <td className="px-2 py-2 text-sam-fg">
                  <div className="max-w-[200px] truncate font-medium" title={o.storeName}>
                    {o.storeName}
                  </div>
                  <div className="sam-text-helper text-sam-muted">
                    {o.storeSlug ? (
                      <span title={o.storeSlug}>/{o.storeSlug}</span>
                    ) : (
                      <span className="text-sam-meta">{t("admin_do_no_slug")}</span>
                    )}
                  </div>
                  <div className="sam-text-xxs text-sam-muted">
                    {t("admin_do_owner", { name: o.storeOwnerName || "—" })}{" "}
                    <span className="font-mono text-sam-meta" title={o.storeOwnerUserId}>
                      · {shortId(o.storeOwnerUserId)}
                    </span>
                  </div>
                  <div className="font-mono sam-text-xxs text-sam-meta" title={o.storeId}>
                    {t("admin_do_store_id", { id: shortId(o.storeId, 12) })}
                  </div>
                </td>
                <td className="px-2 py-2 text-sam-fg">
                  <div className="sam-text-helper leading-snug" title={itemsLineSummary(o)}>
                    {itemsLineSummary(o)}
                  </div>
                  <div className="mt-1 sam-text-xxs leading-snug text-sam-muted" title={fulfillmentSummary(o)}>
                    {fulfillmentSummary(o)}
                  </div>
                  {o.requestNote?.trim() ? (
                    <div
                      className="mt-1 rounded bg-signature/5 px-1.5 py-0.5 sam-text-xxs text-sam-fg"
                      title={o.requestNote}
                    >
                      {t("admin_do_request_note", {
                        note: o.requestNote.length > 80 ? `${o.requestNote.slice(0, 80)}…` : o.requestNote,
                      })}
                    </div>
                  ) : null}
                </td>
                <td className="px-2 py-2 whitespace-nowrap">
                  {o.orderType === "delivery" ? t("admin_do_order_type_delivery") : t("admin_do_order_type_pickup")}
                </td>
                <td className="px-2 py-2 whitespace-nowrap font-medium">{formatMoneyPhp(o.finalAmount)}</td>
                <td className="px-2 py-2">
                  <PaymentStatusBadge status={o.paymentStatus} />
                </td>
                <td className="px-2 py-2">
                  <OrderStatusBadge status={o.orderStatus} />
                </td>
                <td className="px-2 py-2">
                  <AdminActionStatusBadge status={o.adminActionStatus} />
                </td>
                <td className="px-2 py-2 whitespace-nowrap">
                  <div className="flex flex-col gap-0.5">
                    <Link href={consoleHref} className="font-medium text-signature hover:underline">
                      {t("admin_do_common_detail")}
                    </Link>
                    {src === "store_db" ? (
                      <Link href={actionHref} className="sam-text-xxs text-sam-muted hover:underline">
                        {t("admin_do_nav_store_orders")}
                      </Link>
                    ) : null}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
