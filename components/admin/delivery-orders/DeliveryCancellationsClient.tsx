"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import {
  fetchAdminStoreOrdersByOrderStatus,
  parseAdminStoreOrdersResponse,
} from "@/lib/admin/fetch-admin-store-orders-scoped";
import type { AdminDeliveryOrder } from "@/lib/admin/delivery-orders-admin/types";
import { CancelRequestTable } from "./CancelRequestTable";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

export function DeliveryCancellationsClient() {
  const { t } = useI18n();
  const [rows, setRows] = useState<AdminDeliveryOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { status, json } = await fetchAdminStoreOrdersByOrderStatus("cancelled");
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
  }, []);

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
