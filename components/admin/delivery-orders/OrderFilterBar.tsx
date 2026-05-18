"use client";

import type { OrderListFilters } from "@/lib/admin/delivery-orders-admin/types";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  DO_ORDER_STATUS_LIST,
  DO_PAYMENT_STATUS_LIST,
  DO_SETTLEMENT_STATUS_LIST,
  useDoAdminStatusLabels,
} from "./useDoAdminStatusLabels";

export function OrderFilterBar({
  filters,
  onChange,
}: {
  filters: OrderListFilters;
  onChange: (f: OrderListFilters) => void;
}) {
  const { t } = useI18n();
  const { orderStatus, paymentStatus, settlementStatus } = useDoAdminStatusLabels();

  const patch = (p: Partial<OrderListFilters>) => {
    const next = { ...filters, ...p };
    if ("orderStatus" in p && p.orderStatus !== undefined) next.pipelineBucket = "";
    if ("pipelineBucket" in p && p.pipelineBucket) next.orderStatus = "";
    onChange(next);
  };

  return (
    <div className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
      <p className="text-sm font-semibold text-sam-fg">{t("admin_do_filter_title")}</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block text-xs text-sam-muted">
          {t("admin_do_filter_start")}
          <input
            type="date"
            value={filters.dateFrom}
            onChange={(e) => patch({ dateFrom: e.target.value })}
            className="mt-1 w-full rounded border border-sam-border px-2 py-1.5 text-sm"
          />
        </label>
        <label className="block text-xs text-sam-muted">
          {t("admin_do_filter_end")}
          <input
            type="date"
            value={filters.dateTo}
            onChange={(e) => patch({ dateTo: e.target.value })}
            className="mt-1 w-full rounded border border-sam-border px-2 py-1.5 text-sm"
          />
        </label>
        <label className="block text-xs text-sam-muted">
          {t("admin_do_filter_order_status")}
          <select
            value={filters.orderStatus}
            onChange={(e) => patch({ orderStatus: e.target.value })}
            className="mt-1 w-full rounded border border-sam-border px-2 py-1.5 text-sm"
          >
            <option value="">{t("admin_do_common_all")}</option>
            {DO_ORDER_STATUS_LIST.map((k) => (
              <option key={k} value={k}>
                {orderStatus(k)}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs text-sam-muted">
          {t("admin_do_filter_payment_status")}
          <select
            value={filters.paymentStatus}
            onChange={(e) => patch({ paymentStatus: e.target.value })}
            className="mt-1 w-full rounded border border-sam-border px-2 py-1.5 text-sm"
          >
            <option value="">{t("admin_do_common_all")}</option>
            {DO_PAYMENT_STATUS_LIST.map((k) => (
              <option key={k} value={k}>
                {paymentStatus(k)}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs text-sam-muted">
          {t("admin_do_filter_settlement_status")}
          <select
            value={filters.settlementStatus}
            onChange={(e) => patch({ settlementStatus: e.target.value })}
            className="mt-1 w-full rounded border border-sam-border px-2 py-1.5 text-sm"
          >
            <option value="">{t("admin_do_common_all")}</option>
            {DO_SETTLEMENT_STATUS_LIST.map((k) => (
              <option key={k} value={k}>
                {settlementStatus(k)}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs text-sam-muted">
          {t("admin_do_filter_order_type")}
          <select
            value={filters.orderType}
            onChange={(e) => patch({ orderType: e.target.value })}
            className="mt-1 w-full rounded border border-sam-border px-2 py-1.5 text-sm"
          >
            <option value="">{t("admin_do_common_all")}</option>
            <option value="delivery">{t("admin_do_filter_type_delivery")}</option>
            <option value="pickup">{t("admin_do_filter_type_pickup")}</option>
          </select>
        </label>
        <label className="block text-xs text-sam-muted">
          {t("admin_do_filter_store_owner")}
          <input
            value={filters.storeQuery}
            onChange={(e) => patch({ storeQuery: e.target.value })}
            className="mt-1 w-full rounded border border-sam-border px-2 py-1.5 text-sm"
            placeholder={t("admin_do_filter_store_placeholder")}
          />
        </label>
        <label className="block text-xs text-sam-muted">
          {t("admin_do_filter_buyer")}
          <input
            value={filters.buyerQuery}
            onChange={(e) => patch({ buyerQuery: e.target.value })}
            className="mt-1 w-full rounded border border-sam-border px-2 py-1.5 text-sm"
            placeholder={t("admin_do_filter_buyer_placeholder")}
          />
        </label>
        <label className="block text-xs text-sam-muted">
          {t("admin_do_filter_order_no")}
          <input
            value={filters.orderNoQuery}
            onChange={(e) => patch({ orderNoQuery: e.target.value })}
            className="mt-1 w-full rounded border border-sam-border px-2 py-1.5 text-sm"
            placeholder="FD-…"
          />
        </label>
      </div>
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={filters.reportsOnly}
            onChange={(e) => patch({ reportsOnly: e.target.checked })}
          />
          {t("admin_do_filter_report_only")}
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={filters.heldSettlementOnly}
            onChange={(e) => patch({ heldSettlementOnly: e.target.checked })}
          />
          {t("admin_do_filter_settlement_hold")}
        </label>
      </div>
    </div>
  );
}
