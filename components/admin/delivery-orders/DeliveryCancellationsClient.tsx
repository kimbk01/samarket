"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import {
  fetchAdminStoreOrdersByOrderStatus,
  parseAdminStoreOrdersResponse,
} from "@/lib/admin/fetch-admin-store-orders-scoped";
import type { AdminDeliveryOrder } from "@/lib/admin/delivery-orders-admin/types";
import { CancelRequestTable } from "./CancelRequestTable";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { businessCcBackToStoreHref } from "@/lib/admin-business/business-control-center-links";

export function DeliveryCancellationsClient() {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const storeIdFilter = (searchParams.get("store_id") ?? "").trim();
  const [rows, setRows] = useState<AdminDeliveryOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { status, json } = await fetchAdminStoreOrdersByOrderStatus(
        "cancelled",
        storeIdFilter || undefined
      );
      const j = json as { ok?: boolean; error?: string };
      if (status < 200 || status >= 300 || j.ok === false) {
        setRows([]);
        setError(typeof j.error === "string" ? j.error : `HTTP ${status}`);
        return;
      }
      setRows(parseAdminStoreOrdersResponse(json));
    } catch {
      setRows([]);
      setError("network_error");
    } finally {
      setLoading(false);
    }
  }, [storeIdFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="p-4 md:p-6">
      <AdminPageHeader titleKey="admin_do_cancellations_title" backHref="/admin/stores/orders" />
      <p className="mb-2 sam-text-body-secondary text-sam-muted">
        <code className="rounded bg-sam-app px-1 sam-text-helper">cancelled</code>{" "}
        {t("admin_do_cancellations_intro")}{" "}
        <Link href="/admin/store-orders" className="text-signature underline">
          {t("admin_do_nav_store_orders")}
        </Link>
        {t("admin_do_cancellations_intro_suffix")}
      </p>
      {storeIdFilter ? (
        <p className="mb-2 sam-text-helper text-sam-muted">
          store_id={storeIdFilter}{" "}
          <Link href={businessCcBackToStoreHref(storeIdFilter)} className="text-signature hover:underline">
            {t("admin_biz_cta_back_store")}
          </Link>
          {" · "}
          <Link href="/admin/stores/orders/cancellations" className="text-signature hover:underline">
            {t("admin_do_common_clear_store_filter")}
          </Link>
        </p>
      ) : null}
      {error ? (
        <p className="mb-3 rounded-ui-rect border border-amber-200 bg-amber-50 px-3 py-2 sam-text-helper text-amber-950">
          {t("admin_do_common_load_failed", { error })}
        </p>
      ) : null}
      <div className="mb-2">
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="rounded-ui-rect border border-sam-border px-3 py-1.5 text-xs text-sam-fg disabled:opacity-50"
        >
          {loading ? t("admin_do_common_refreshing") : t("admin_do_common_refresh")}
        </button>
      </div>
      <AdminCard titleKey="admin_do_cancellations_card">
        {loading ? (
          <p className="text-sm text-sam-muted">{t("admin_dashboard_loading")}</p>
        ) : (
          <CancelRequestTable
            rows={rows}
            showWorkflowActions={false}
            onApprove={() => {}}
            onReject={() => {}}
          />
        )}
      </AdminCard>
    </div>
  );
}
